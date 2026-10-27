import zlib from 'zlib';
import crypto from 'crypto';
import { extractText } from 'unpdf';
import { createWorker } from 'tesseract.js';

export function computeContentHash(content: string): string {
  const normalized = content
    .toLowerCase()
    .replace(/\r\n/g, '\n')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function extractTextFromImageOcr(imageBuffer: Buffer): Promise<string> {
  console.log('[OCR] Initializing Tesseract.js worker for image recognition...');
  const worker = await createWorker('eng');
  try {
    const ret = await worker.recognize(imageBuffer);
    const text = ret.data.text?.trim() || '';
    if (!text || text.length < 5) {
      throw new Error(
        'Tesseract OCR could not detect legible handwritten or printed text in this image. Please ensure the photo is clear, focused, and well-lit.'
      );
    }
    console.log(`[OCR] Tesseract.js successfully extracted ${text.length} characters.`);
    return text;
  } finally {
    await worker.terminate();
  }
}

export interface ParsedSection {
  index: number;
  title: string;
  content: string;
  start_char: number;
  end_char: number;
}

export interface QuoteVerification {
  verified: boolean;
  match_percentage: number;
  quote: string;
  start_char: number;
  end_char: number;
  surrounding_passage: string;
  line_number: number;
  status: string;
}

function decodePdfLiteralString(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function extractTextFromPdfFallback(buffer: Buffer): string {
  const rawLatin = buffer.toString('latin1');
  const chunks: string[] = [];

  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(rawLatin)) !== null) {
    const streamContent = Buffer.from(match[1], 'latin1');
    let decoded = '';
    try {
      decoded = zlib.inflateSync(streamContent).toString('latin1');
    } catch {
      decoded = streamContent.toString('latin1');
    }

    const tjMatches = decoded.matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g);
    for (const m of tjMatches) {
      chunks.push(decodePdfLiteralString(m[1]));
    }

    const tjArrayMatches = decoded.matchAll(/\[([\s\S]*?)\]\s*TJ/g);
    for (const m of tjArrayMatches) {
      const inner = m[1];
      const parts: string[] = [];
      for (const sub of inner.matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)/g)) {
        parts.push(decodePdfLiteralString(sub[1]));
      }
      if (parts.length > 0) {
        chunks.push(parts.join(''));
      }
    }
  }

  const joined = chunks.join(' ').replace(/\s+/g, ' ').trim();
  if (joined.length >= 10) {
    return joined;
  }

  throw new Error('Could not extract any readable text from this PDF file.');
}

export async function extractTextFromFile(
  fileBuffer: Buffer,
  filename: string
): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) {
    try {
      const data = new Uint8Array(
        fileBuffer.buffer,
        fileBuffer.byteOffset,
        fileBuffer.byteLength
      );
      const { text: pages } = await extractText(data, { mergePages: false });
      const pagesText = pages
        .map((pageText, idx) => {
          const cleaned = (pageText || '').trim();
          return cleaned ? `--- [Page ${idx + 1}] ---\n${cleaned}` : '';
        })
        .filter(Boolean)
        .join('\n\n')
        .trim();

      if (pagesText.length >= 10) {
        return pagesText;
      }
    } catch {
      // Fall back to lightweight stream parser below
    }
    return extractTextFromPdfFallback(fileBuffer);
  }

  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    return fileBuffer.toString('utf-8').trim();
  }

  if (/\.(png|jpe?g|webp|bmp|tiff)$/i.test(lower)) {
    return extractTextFromImageOcr(fileBuffer);
  }

  const text = fileBuffer.toString('utf-8').trim();
  if (!text) {
    throw new Error(
      `Unsupported file format for '${filename}'. Please upload a .txt, .md, .pdf, or an image note (.png, .jpg, .jpeg, .webp).`
    );
  }
  return text;
}

export function processTextIntoSections(text: string): ParsedSection[] {
  const lines = text.split(/\r?\n/);
  const sections: ParsedSection[] = [];

  let currentTitle = 'Overview';
  let currentLines: string[] = [];
  let currentStart = 0;
  let sectionIndex = 1;

  const headingRegex = /^(#{1,4}\s+|[0-9]+\.\s+|Section\s+[0-9]+|Stage\s+[0-9]+|---\s*\[Page\s+[0-9]+\]\s*---)/i;

  let charCounter = 0;
  for (const line of lines) {
    const stripped = line.trim();
    const isHeading = headingRegex.test(stripped) && stripped.length < 120;

    if (isHeading && currentLines.length > 0) {
      const content = currentLines.join('\n').trim();
      if (content) {
        sections.push({
          index: sectionIndex,
          title: currentTitle,
          content,
          start_char: currentStart,
          end_char: currentStart + content.length,
        });
        sectionIndex += 1;
      }
      currentLines = [line];
      currentTitle = stripped.replace(/^#+\s*/, '').replace(/^---\s*|\s*---$/g, '');
      currentStart = charCounter;
    } else {
      if (currentLines.length === 0 && isHeading) {
        currentTitle = stripped.replace(/^#+\s*/, '').replace(/^---\s*|\s*---$/g, '');
      }
      currentLines.push(line);
    }

    charCounter += line.length + 1;
  }

  if (currentLines.length > 0) {
    const content = currentLines.join('\n').trim();
    if (content) {
      sections.push({
        index: sectionIndex,
        title: currentTitle,
        content,
        start_char: currentStart,
        end_char: currentStart + content.length,
      });
    }
  }

  if (sections.length === 0) {
    const trimmed = text.trim();
    sections.push({
      index: 1,
      title: 'Full Content',
      content: trimmed,
      start_char: 0,
      end_char: trimmed.length,
    });
  }

  return sections;
}

export function verifyQuoteInText(quote: string, fullText: string): QuoteVerification {
  const cleanedQuote = quote.trim().replace(/^["']+|["']+$/g, '');
  if (!cleanedQuote || cleanedQuote.length < 3) {
    return {
      verified: false,
      match_percentage: 0.0,
      quote,
      start_char: -1,
      end_char: -1,
      surrounding_passage: '',
      line_number: -1,
      status: 'Quote is too short or empty',
    };
  }

  // 1. Exact match attempt
  let pos = fullText.indexOf(cleanedQuote);
  if (pos !== -1) {
    const startChar = pos;
    const endChar = pos + cleanedQuote.length;
    const lineNum = fullText.slice(0, startChar).split('\n').length;
    const ctxStart = Math.max(0, startChar - 160);
    const ctxEnd = Math.min(fullText.length, endChar + 160);
    return {
      verified: true,
      match_percentage: 100.0,
      quote: cleanedQuote,
      start_char: startChar,
      end_char: endChar,
      surrounding_passage: fullText.slice(ctxStart, ctxEnd),
      line_number: lineNum,
      status: 'Exact 100% Match Verified',
    };
  }

  // 2. Case-insensitive match attempt
  const lowerText = fullText.toLowerCase();
  const lowerQuote = cleanedQuote.toLowerCase();
  pos = lowerText.indexOf(lowerQuote);
  if (pos !== -1) {
    const startChar = pos;
    const endChar = pos + cleanedQuote.length;
    const lineNum = fullText.slice(0, startChar).split('\n').length;
    const ctxStart = Math.max(0, startChar - 160);
    const ctxEnd = Math.min(fullText.length, endChar + 160);
    return {
      verified: true,
      match_percentage: 98.0,
      quote: fullText.slice(startChar, endChar),
      start_char: startChar,
      end_char: endChar,
      surrounding_passage: fullText.slice(ctxStart, ctxEnd),
      line_number: lineNum,
      status: 'Case-Insensitive Match Verified',
    };
  }

  // 3. Normalized whitespace match
  const normQuote = lowerQuote.replace(/\s+/g, ' ');
  const words = normQuote
    .split(' ')
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (words.length >= 3) {
    const pattern = new RegExp(words.slice(0, 12).join('\\s+'), 'i');
    const match = pattern.exec(fullText);
    if (match && match.index !== undefined) {
      const startChar = match.index;
      const endChar = startChar + match[0].length;
      const lineNum = fullText.slice(0, startChar).split('\n').length;
      const ctxStart = Math.max(0, startChar - 160);
      const ctxEnd = Math.min(fullText.length, endChar + 160);
      return {
        verified: true,
        match_percentage: 92.0,
        quote: fullText.slice(startChar, endChar),
        start_char: startChar,
        end_char: endChar,
        surrounding_passage: fullText.slice(ctxStart, ctxEnd),
        line_number: lineNum,
        status: 'Normalized Passage Match Verified',
      };
    }
  }

  return {
    verified: false,
    match_percentage: 0.0,
    quote: cleanedQuote,
    start_char: -1,
    end_char: -1,
    surrounding_passage: '',
    line_number: -1,
    status: 'Quote not found verbatim in note source',
  };
}

export interface MultipartParsed {
  fields: Record<string, string>;
  file?: {
    filename: string;
    contentType: string;
    data: Buffer;
  };
}

export function parseMultipartFormData(body: Buffer, contentTypeHeader: string): MultipartParsed {
  const boundaryMatch = contentTypeHeader.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error('Missing multipart boundary');
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2].trim();
  const delimiter = Buffer.from(`--${boundary}`);
  const result: MultipartParsed = { fields: {} };

  let start = body.indexOf(delimiter);
  if (start === -1) return result;
  start += delimiter.length;

  while (start < body.length) {
    if (body[start] === 0x2d && body[start + 1] === 0x2d) {
      break;
    }
    if (body[start] === 0x0d && body[start + 1] === 0x0a) {
      start += 2;
    } else if (body[start] === 0x0a) {
      start += 1;
    }

    const nextBoundary = body.indexOf(delimiter, start);
    if (nextBoundary === -1) break;

    const part = body.subarray(start, nextBoundary);
    start = nextBoundary + delimiter.length;

    let headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    let headerSepLen = 4;
    if (headerEnd === -1) {
      headerEnd = part.indexOf(Buffer.from('\n\n'));
      headerSepLen = 2;
    }
    if (headerEnd === -1) continue;

    const headersText = part.subarray(0, headerEnd).toString('utf-8');
    let contentEnd = part.length;
    if (contentEnd >= 2 && part[contentEnd - 2] === 0x0d && part[contentEnd - 1] === 0x0a) {
      contentEnd -= 2;
    } else if (contentEnd >= 1 && part[contentEnd - 1] === 0x0a) {
      contentEnd -= 1;
    }
    const contentBuf = part.subarray(headerEnd + headerSepLen, contentEnd);

    const nameMatch = headersText.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];

    const filenameMatch = headersText.match(/filename="([^"]*)"/i);
    if (filenameMatch) {
      const ctMatch = headersText.match(/Content-Type:\s*([^\r\n]+)/i);
      result.file = {
        filename: filenameMatch[1] || 'uploaded_note.txt',
        contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
        data: Buffer.from(contentBuf),
      };
    } else {
      result.fields[fieldName] = contentBuf.toString('utf-8');
    }
  }

  return result;
}
