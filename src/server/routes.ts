import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { PublicUser, QuestionAnswerResponse } from './types.ts';
import { store } from './store.ts';
import {
  extractTextFromFile,
  parseMultipartFormData,
  verifyQuoteInText,
} from './documentService.ts';
import {
  DEFAULT_GEMMA_MODEL,
  answerQuestionGrounded,
  fetchWebGroundedAnswer,
  generateGroundedQuiz,
} from './aiService.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface AuthenticatedRequest extends Request {
  user?: PublicUser;
  sessionToken?: string;
}

export const apiRouter = express.Router();

const jsonParser = express.json({ limit: '100mb' });
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB
const SESSION_COOKIE_NAME = 'nb_session';

function extractSessionToken(req: Request): string {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  const rawCookie = req.headers.cookie || '';
  if (rawCookie) {
    const pairs = rawCookie.split(';');
    for (const part of pairs) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (key === SESSION_COOKIE_NAME && val) {
        return decodeURIComponent(val);
      }
    }
  }
  return '';
}

function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  const isSecure =
    process.env.NODE_ENV === 'production' || Boolean(process.env.APP_URL);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Expires=${expiresAt.toUTCString()}`,
    'HttpOnly',
    isSecure ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res: Response): void {
  const isSecure =
    process.env.NODE_ENV === 'production' || Boolean(process.env.APP_URL);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    isSecure ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractSessionToken(req);
    if (!token) {
      res.status(401).json({ detail: 'Authentication required. Please sign in.' });
      return;
    }

    // 1. Try Firebase ID Token verification if token looks like a JWT
    if (token.includes('.') && token.length > 80) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        if (decoded && decoded.email) {
          const authResult = await store.findOrCreateFirebaseUser(
            decoded.uid,
            decoded.email,
            decoded.name
          );
          req.user = authResult.user;
          req.sessionToken = token;
          next();
          return;
        }
      } catch {
        // Fall back to session token lookup below
      }
    }

    // 2. Regular session token lookup
    const user = await store.authenticateToken(token);
    if (!user) {
      res.status(401).json({ detail: 'Your session has expired. Please sign in again.' });
      return;
    }
    req.user = user;
    req.sessionToken = token;
    next();
  } catch (err: unknown) {
    console.error('[Auth] Verification failed:', err);
    res.status(500).json({ detail: 'Unable to verify authentication session.' });
  }
}

// Temporary in-memory chunk assembly for large file uploads (isolated per userId)
const pendingUploads = new Map<
  string,
  {
    userId: number;
    filename: string;
    title: string;
    topic: string;
    totalChunks: number;
    chunks: Buffer[];
    createdAt: number;
  }
>();

function readRawRequestBody(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      resolve(req.body);
      return;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer | string) => {
      if (aborted) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        aborted = true;
        reject(
          new Error(
            `Uploaded file exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB maximum limit.`
          )
        );
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (!aborted) {
        resolve(Buffer.concat(chunks));
      }
    });

    req.on('error', (err) => {
      if (!aborted) {
        reject(err);
      }
    });
  });
}

async function processUploadedNoteBuffer(params: {
  userId: number;
  fileData: Buffer;
  filename: string;
  rawTitle?: string;
  rawTopic?: string;
  user?: PublicUser;
}) {
  const filename = params.filename || 'uploaded_note.txt';
  const fileExt = filename.includes('.')
    ? filename.split('.').pop()!.toLowerCase()
    : 'txt';

  const extractedText = await extractTextFromFile(params.fileData, filename);
  if (extractedText.trim().length < 10) {
    throw new Error('Extracted text is too short to be a valid study note.');
  }

  const rawTitle = (params.rawTitle || '').trim();
  const rawTopic = (params.rawTopic || '').trim();

  const defaultTitle = filename
    .replace(/\.[^.]+$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const noteTitle = rawTitle || defaultTitle;
  const noteTopic = rawTopic || `General: ${noteTitle}`;

  return store.createNote({
    userId: params.userId,
    title: noteTitle,
    topic: noteTopic,
    fileType: fileExt,
    originalFilename: filename,
    content: extractedText,
    authorName: params.user?.full_name,
    authorCollege: params.user?.college,
    authorUniversity: params.user?.university,
    authorCourse: params.user?.course,
    authorStream: params.user?.stream,
  });
}

// ====================================================
// Public System & Authentication Routes
// ====================================================

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'NoteBound AI Backend',
    model: DEFAULT_GEMMA_MODEL,
    database: store.getEngineName(),
    api_docs: '/docs',
  });
});

apiRouter.get('/system', (_req: Request, res: Response) => {
  res.json({
    app_name: 'NoteBound AI',
    ai_engine: DEFAULT_GEMMA_MODEL,
    database: store.getEngineName(),
    verification_engine: 'Exact substring & character offset evidence matcher',
    supported_documents: [
      'PDF (.pdf)',
      'Text (.txt)',
      'Markdown (.md)',
      'Handwritten Notes / Photo Scan (PNG, JPG, JPEG, WEBP via Tesseract.js OCR)',
      'Pasted Notes',
    ],
  });
});

apiRouter.post('/auth/register', jsonParser, async (req: Request, res: Response) => {
  try {
    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');

    const { user, token, expiresAt } = await store.registerUser({
      fullName,
      email,
      password,
    });

    setSessionCookie(res, token, expiresAt);
    res.status(201).json({
      user,
      token,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Registration failed.';
    const status = msg.includes('already exists') ? 409 : 400;
    res.status(status).json({ detail: msg });
  }
});

apiRouter.post('/auth/login', jsonParser, async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ detail: 'Please enter both your email and password.' });
      return;
    }

    const { user, token, expiresAt } = await store.loginUser({ email, password });
    setSessionCookie(res, token, expiresAt);
    res.json({
      user,
      token,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Sign-in failed.';
    res.status(401).json({ detail: msg });
  }
});

apiRouter.post('/auth/firebase-login', jsonParser, async (req: Request, res: Response) => {
  try {
    const idToken = String(req.body?.idToken || '').trim();
    if (!idToken) {
      res.status(400).json({ detail: 'Missing Firebase ID token.' });
      return;
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.email) {
      res.status(400).json({ detail: 'Firebase account missing email address.' });
      return;
    }

    const { user, token, expiresAt } = await store.findOrCreateFirebaseUser(
      decoded.uid,
      decoded.email,
      decoded.name
    );

    setSessionCookie(res, token, expiresAt);
    res.json({
      user,
      token,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err: unknown) {
    console.error('[Auth] Firebase login verification failed:', err);
    const msg = err instanceof Error ? err.message : 'Google authentication failed.';
    res.status(401).json({ detail: msg });
  }
});

apiRouter.post('/auth/logout', async (req: Request, res: Response) => {
  try {
    const token = extractSessionToken(req);
    if (token) {
      await store.revokeSession(token);
    }
    clearSessionCookie(res);
    res.json({ message: 'Signed out successfully.' });
  } catch (err: unknown) {
    clearSessionCookie(res);
    res.json({ message: 'Signed out.' });
  }
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

apiRouter.post(
  ['/user/profile', '/auth/profile'],
  requireAuth,
  jsonParser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { full_name, course, stream, college, university } = req.body || {};
      if (!course || !stream || !college || !university) {
        res.status(400).json({
          detail: 'Course, Stream, College, and University are required for your student profile.',
        });
        return;
      }
      const updated = await store.updateUserProfile(req.user!.id, {
        fullName: full_name ? String(full_name).trim() : undefined,
        course: String(course).trim(),
        stream: String(stream).trim(),
        college: String(college).trim(),
        university: String(university).trim(),
      });
      req.user = updated;
      res.json({ user: updated, message: 'Profile updated successfully.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile.';
      res.status(400).json({ detail: msg });
    }
  }
);

// ====================================================
// Protected Per-User Notes & Documents Routes (/api/notes)
// ====================================================

apiRouter.get(
  '/notes',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const notes = await store.listNotes(req.user!.id);
      res.json(notes);
    } catch (err: unknown) {
      console.error('listNotes failed:', err);
      res.status(500).json({ detail: 'Failed to load study notes.' });
    }
  }
);

apiRouter.post(
  '/notes/seed',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const added = await store.seedSampleNotes(req.user!.id);
      res.json({
        message:
          added > 0
            ? `Added ${added} sample study note${added === 1 ? '' : 's'} to your library.`
            : 'Sample study notes are already in your library.',
        added,
      });
    } catch (err: unknown) {
      console.error('seedSampleNotes failed:', err);
      res.status(500).json({ detail: 'Failed to load sample notes.' });
    }
  }
);

apiRouter.post(
  '/notes/upload',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contentType = req.headers['content-type'] || '';
      const rawBody = await readRawRequestBody(req, MAX_UPLOAD_BYTES);
      const parsed = parseMultipartFormData(rawBody, contentType);

      if (!parsed.file || parsed.file.data.length === 0) {
        res.status(400).json({ detail: 'Uploaded file is empty.' });
        return;
      }

      const created = await processUploadedNoteBuffer({
        userId: req.user!.id,
        fileData: parsed.file.data,
        filename: parsed.file.filename,
        rawTitle: parsed.fields.title,
        rawTopic: parsed.fields.topic,
        user: req.user,
      });

      res.status(201).json(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('exceeds the') ? 413 : 400;
      res.status(status).json({ detail: msg });
    }
  }
);

// Chunked upload endpoint for files > 12 MB behind reverse proxies with per-request size caps
apiRouter.post(
  '/notes/upload-chunk',
  requireAuth,
  jsonParser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const {
        upload_id,
        chunk_index,
        total_chunks,
        chunk_base64,
        filename,
        title,
        topic,
      } = req.body || {};

      const uploadId = `${userId}:${String(upload_id || '').trim()}`;
      const chunkIndex = Number(chunk_index);
      const totalChunks = Number(total_chunks);

      if (!upload_id || Number.isNaN(chunkIndex) || !totalChunks || !chunk_base64) {
        res.status(400).json({ detail: 'Invalid upload chunk payload.' });
        return;
      }

      // Prune stale uploads older than 15 minutes
      const now = Date.now();
      for (const [k, v] of pendingUploads.entries()) {
        if (now - v.createdAt > 15 * 60 * 1000) {
          pendingUploads.delete(k);
        }
      }

      let session = pendingUploads.get(uploadId);
      if (!session) {
        session = {
          userId,
          filename: String(filename || 'uploaded_note.txt'),
          title: String(title || ''),
          topic: String(topic || ''),
          totalChunks,
          chunks: new Array(totalChunks),
          createdAt: now,
        };
        pendingUploads.set(uploadId, session);
      }

      session.chunks[chunkIndex] = Buffer.from(String(chunk_base64), 'base64');

      const receivedCount = session.chunks.filter(Boolean).length;
      if (receivedCount < session.totalChunks) {
        res.json({
          status: 'chunk_received',
          received_chunks: receivedCount,
          total_chunks: session.totalChunks,
        });
        return;
      }

      const fullBuffer = Buffer.concat(session.chunks);
      pendingUploads.delete(uploadId);

      const created = await processUploadedNoteBuffer({
        userId,
        fileData: fullBuffer,
        filename: session.filename,
        rawTitle: session.title,
        rawTopic: session.topic,
        user: req.user,
      });

      res.status(201).json(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ detail: msg });
    }
  }
);

apiRouter.post(
  '/notes',
  requireAuth,
  jsonParser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { title, topic, content } = req.body || {};
      if (!title || String(title).trim().length < 2) {
        res.status(400).json({ detail: 'Note title must be at least 2 characters long.' });
        return;
      }
      if (!topic || String(topic).trim().length < 2) {
        res.status(400).json({ detail: 'Note topic must be at least 2 characters long.' });
        return;
      }
      const text = String(content || '').trim();
      if (text.length < 10) {
        res.status(400).json({ detail: 'Note content must be at least 10 characters long.' });
        return;
      }

      const created = await store.createNote({
        userId: req.user!.id,
        title: String(title).trim(),
        topic: String(topic).trim(),
        fileType: 'pasted',
        originalFilename: null,
        content: text,
        authorName: req.user?.full_name,
        authorCollege: req.user?.college,
        authorUniversity: req.user?.university,
        authorCourse: req.user?.course,
        authorStream: req.user?.stream,
      });

      res.status(201).json(created);
    } catch (err: unknown) {
      console.error('createNote failed:', err);
      res.status(500).json({ detail: 'Failed to save study note.' });
    }
  }
);

apiRouter.get(
  '/notes/:noteId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const noteId = Number(req.params.noteId);
      const detail = await store.getNoteDetail(req.user!.id, noteId);
      if (!detail) {
        res.status(404).json({ detail: `Note with id ${noteId} not found.` });
        return;
      }
      res.json(detail);
    } catch (err: unknown) {
      console.error('getNoteDetail failed:', err);
      res.status(500).json({ detail: 'Failed to fetch note details.' });
    }
  }
);

apiRouter.delete(
  '/notes/:noteId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const noteId = Number(req.params.noteId);
      const ok = await store.deleteNote(req.user!.id, noteId);
      if (!ok) {
        res.status(404).json({ detail: `Note ${noteId} not found.` });
        return;
      }
      res.json({ message: `Note ${noteId} successfully deleted.` });
    } catch (err: unknown) {
      console.error('deleteNote failed:', err);
      res.status(500).json({ detail: 'Failed to delete study note.' });
    }
  }
);

// ====================================================
// Central Library (Peer Notes Sharing & Deduplication)
// ====================================================

apiRouter.get(
  '/central-library',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filter = String(req.query.filter || 'all');
      const search = String(req.query.search || '');
      const notes = await store.listCentralLibrary(req.user!.id, filter, search);
      res.json(notes);
    } catch (err: unknown) {
      console.error('listCentralLibrary failed:', err);
      res.status(500).json({ detail: 'Failed to load Central Library notes.' });
    }
  }
);

apiRouter.post(
  '/central-library/:noteId/save',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const noteId = Number(req.params.noteId);
      if (Number.isNaN(noteId)) {
        res.status(400).json({ detail: 'Invalid note ID.' });
        return;
      }
      const cloned = await store.cloneNoteToUser(req.user!.id, noteId);
      res.json({
        note: cloned,
        message: 'Note saved to your personal library with zero database storage duplication!',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save note to your library.';
      res.status(400).json({ detail: msg });
    }
  }
);

// ====================================================
// Protected Grounded Q&A & Evidence Routes (/api/qa)
// ====================================================

apiRouter.get(
  '/qa/history',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const history = await store.listQaHistory(req.user!.id, 15);
      res.json(history);
    } catch (err: unknown) {
      console.error('listQaHistory failed:', err);
      res.status(500).json({ detail: 'Failed to load Q&A history.' });
    }
  }
);

apiRouter.post(
  '/qa/ask',
  requireAuth,
  jsonParser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const question = String(req.body?.question || '').trim();
      const noteId = req.body?.note_id ? Number(req.body.note_id) : null;
      const topic = req.body?.topic ? String(req.body.topic).trim() : null;

      if (!question) {
        res.status(400).json({ detail: 'Question cannot be empty.' });
        return;
      }

      let notes = await store.listNotesWithContent(userId);
      if (noteId) {
        notes = notes.filter((n) => n.id === noteId);
        if (notes.length === 0) {
          res.status(404).json({ detail: `Note with id ${noteId} not found.` });
          return;
        }
      } else if (topic) {
        let filtered = notes.filter((n) => n.topic === topic);
        if (filtered.length === 0) {
          const lowerTopic = topic.toLowerCase();
          filtered = notes.filter((n) => n.topic.toLowerCase().includes(lowerTopic));
        }
        notes = filtered;
      }

      if (notes.length === 0) {
        console.log(`[QA] No local notes found for '${question}'. Triggering web search grounding...`);
        const webResult = await fetchWebGroundedAnswer(question);
        const webResponse: QuestionAnswerResponse = {
          status: 'WEB_GROUNDED',
          is_supported: true,
          answer: webResult.answer,
          evidence_list: [],
          model_used: webResult.model_used,
          notes_consulted: [],
          confidence: webResult.validity_score,
          search_grounding_used: true,
          validity_score: webResult.validity_score,
          web_sources: webResult.web_sources,
          source_type: 'web',
        };
        await store.saveQaHistory({
          userId,
          topicFilter: topic,
          question,
          response: webResponse,
        });
        res.json(webResponse);
        return;
      }

      const result = await answerQuestionGrounded(question, notes);
      await store.saveQaHistory({
        userId,
        topicFilter: topic,
        question,
        response: result,
      });

      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ detail: msg });
    }
  }
);

apiRouter.post(
  '/qa/verify-evidence',
  requireAuth,
  jsonParser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const quote = String(req.body?.quote || '');
      const noteId = Number(req.body?.note_id);
      const note = await store.getNoteDetail(req.user!.id, noteId);
      if (!note) {
        res.status(404).json({ detail: 'Note not found.' });
        return;
      }

      const ver = verifyQuoteInText(quote, note.content);
      res.json({
        quote,
        verified: ver.verified,
        match_percentage: ver.match_percentage,
        start_char: ver.start_char,
        end_char: ver.end_char,
        surrounding_passage: ver.surrounding_passage,
        line_number: ver.line_number,
        note_title: note.title,
        section_title: note.topic,
        status: ver.status,
      });
    } catch (err: unknown) {
      res.status(500).json({ detail: 'Failed to verify evidence quote.' });
    }
  }
);

// ====================================================
// Protected AI Quizzes & Scoring Routes (/api/quizzes)
// ====================================================

apiRouter.post(
  '/quizzes/generate',
  requireAuth,
  jsonParser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const noteId = req.body?.note_id ? Number(req.body.note_id) : null;
      const topic = req.body?.topic ? String(req.body.topic).trim() : null;
      const numQuestions = Math.max(1, Math.min(10, Number(req.body?.num_questions) || 3));
      const difficultyRaw = String(req.body?.difficulty || 'Medium');
      const difficulty = ['Easy', 'Medium', 'Hard'].includes(difficultyRaw)
        ? difficultyRaw
        : 'Medium';
      const customPrompt = req.body?.custom_prompt
        ? String(req.body.custom_prompt).trim()
        : null;

      let notes = await store.listNotesWithContent(userId);
      if (noteId) {
        notes = notes.filter((n) => n.id === noteId);
        if (notes.length === 0) {
          res.status(404).json({ detail: `Note with id ${noteId} not found.` });
          return;
        }
      } else if (topic) {
        const lowerTopic = topic.toLowerCase();
        notes = notes.filter((n) => n.topic.toLowerCase().includes(lowerTopic));
      } else {
        notes = notes.slice(0, 2);
      }

      if (notes.length === 0) {
        res.status(400).json({
          detail:
            'No notes available in your library to generate a quiz. Upload a PDF/TXT note or load sample notes first.',
        });
        return;
      }

      const topicName = topic || notes[0].topic;
      const quizTitle = `${topicName} Assessment (${difficulty})`;

      const questions = await generateGroundedQuiz({
        notes,
        topic: topicName,
        count: numQuestions,
        difficulty,
        customPrompt,
      });

      if (!questions || questions.length === 0) {
        res.status(500).json({
          detail: 'Model returned zero questions for the selected notes.',
        });
        return;
      }

      const createdQuiz = await store.createQuiz({
        userId,
        noteId: noteId ? notes[0].id : null,
        topic: topicName,
        title: quizTitle,
        difficulty,
        questions,
      });

      res.status(201).json(createdQuiz);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ detail: `Quiz generation failed: ${msg}` });
    }
  }
);

apiRouter.get(
  '/quizzes',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const quizzes = await store.listQuizzes(req.user!.id);
      res.json(quizzes);
    } catch (err: unknown) {
      res.status(500).json({ detail: 'Failed to load quizzes.' });
    }
  }
);

apiRouter.get(
  '/quizzes/attempts/:attemptId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const attemptId = Number(req.params.attemptId);
      const detail = await store.getAttemptDetail(req.user!.id, attemptId);
      if (!detail) {
        res.status(404).json({ detail: 'Quiz attempt not found.' });
        return;
      }
      res.json(detail);
    } catch (err: unknown) {
      res.status(500).json({ detail: 'Failed to load quiz attempt.' });
    }
  }
);

apiRouter.get(
  '/quizzes/:quizId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const quizId = Number(req.params.quizId);
      const quiz = await store.getQuizPublic(req.user!.id, quizId);
      if (!quiz) {
        res.status(404).json({ detail: 'Quiz not found.' });
        return;
      }
      res.json(quiz);
    } catch (err: unknown) {
      res.status(500).json({ detail: 'Failed to load quiz.' });
    }
  }
);

apiRouter.post(
  '/quizzes/:quizId/submit',
  requireAuth,
  jsonParser,
  async (req: AuthenticatedRequest, res: Response) => {
    const quizId = Number(req.params.quizId);
    const payloadQuizId = Number(req.body?.quiz_id);
    if (quizId !== payloadQuizId) {
      res.status(400).json({ detail: 'Quiz ID mismatch between URL and payload.' });
      return;
    }

    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const timeTakenSeconds = Number(req.body?.time_taken_seconds) || 0;

    try {
      const result = await store.scoreQuizAttempt(
        req.user!.id,
        quizId,
        answers,
        timeTakenSeconds
      );
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        res.status(404).json({ detail: msg });
      } else {
        res.status(500).json({ detail: `Scoring error: ${msg}` });
      }
    }
  }
);

// ====================================================
// Protected Analytics Routes (/api/analytics)
// ====================================================

apiRouter.get(
  '/analytics/dashboard',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const analytics = await store.getDashboardAnalytics(req.user!.id);
      res.json(analytics);
    } catch (err: unknown) {
      console.error('getDashboardAnalytics failed:', err);
      res.status(500).json({ detail: 'Failed to load user analytics.' });
    }
  }
);

// Graceful API error middleware
apiRouter.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  if (err?.type === 'entity.too.large' || err?.name === 'PayloadTooLargeError') {
    res.status(413).json({
      detail: 'Uploaded payload exceeds the maximum allowed size.',
    });
    return;
  }
  const status = typeof err?.status === 'number' ? err.status : 500;
  res.status(status).json({
    detail: err?.message || 'Unexpected server error.',
  });
});

// OpenAPI specification for /openapi.json and /docs
export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'NoteBound AI API',
    version: '2.0.0',
    description:
      'Grounded AI learning platform with per-user MySQL storage, verified quotations, evidence inspection, adaptive quizzes, and analytics.',
  },
  paths: {
    '/api/health': { get: { summary: 'Health check', tags: ['System'] } },
    '/api/system': { get: { summary: 'System info', tags: ['System'] } },
    '/api/auth/register': {
      post: { summary: 'Register a new user account', tags: ['Authentication'] },
    },
    '/api/auth/login': {
      post: { summary: 'Sign in with email & password', tags: ['Authentication'] },
    },
    '/api/auth/logout': {
      post: { summary: 'Revoke current session', tags: ['Authentication'] },
    },
    '/api/auth/me': {
      get: { summary: 'Get authenticated user profile', tags: ['Authentication'] },
    },
    '/api/notes': {
      get: { summary: 'List user notes', tags: ['Notes & Documents'] },
      post: { summary: 'Create pasted note', tags: ['Notes & Documents'] },
    },
    '/api/notes/upload': {
      post: { summary: 'Upload TXT/MD/PDF note', tags: ['Notes & Documents'] },
    },
    '/api/notes/upload-chunk': {
      post: { summary: 'Upload large note chunk', tags: ['Notes & Documents'] },
    },
    '/api/notes/seed': {
      post: { summary: 'Seed sample notes into user library', tags: ['Notes & Documents'] },
    },
    '/api/notes/{note_id}': {
      get: { summary: 'Get note detail & sections', tags: ['Notes & Documents'] },
      delete: { summary: 'Delete note', tags: ['Notes & Documents'] },
    },
    '/api/qa/ask': {
      post: { summary: 'Ask grounded question', tags: ['Grounded Q&A & Evidence'] },
    },
    '/api/qa/history': {
      get: { summary: 'List user grounded Q&A history', tags: ['Grounded Q&A & Evidence'] },
    },
    '/api/qa/verify-evidence': {
      post: { summary: 'Verify quote against note', tags: ['Grounded Q&A & Evidence'] },
    },
    '/api/quizzes/generate': {
      post: { summary: 'Generate grounded quiz', tags: ['AI Quizzes & Scoring'] },
    },
    '/api/quizzes': {
      get: { summary: 'List user quizzes', tags: ['AI Quizzes & Scoring'] },
    },
    '/api/quizzes/{quiz_id}': {
      get: { summary: 'Get quiz questions', tags: ['AI Quizzes & Scoring'] },
    },
    '/api/quizzes/{quiz_id}/submit': {
      post: { summary: 'Submit & score quiz attempt', tags: ['AI Quizzes & Scoring'] },
    },
    '/api/quizzes/attempts/{attempt_id}': {
      get: { summary: 'Get past attempt breakdown', tags: ['AI Quizzes & Scoring'] },
    },
    '/api/analytics/dashboard': {
      get: { summary: 'Get user dashboard analytics & mastery', tags: ['Analytics & Adaptive Progress'] },
    },
  },
};
