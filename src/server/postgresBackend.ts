import { and, asc, desc, eq, gt, ne, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import * as schema from '../db/schema.ts';
import type {
  EvidenceItem,
  LearningProgressRecord,
  NoteRecord,
  NoteSection,
  PublicUser,
  QaHistoryRecord,
  QuestionAnswerResponse,
  QuizRecord,
  UserRecord,
  WebSourceItem,
} from './types.ts';
import { computeContentHash, processTextIntoSections, verifyQuoteInText } from './documentService.ts';

function toIsoString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') {
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? val : parsed.toISOString();
  }
  return new Date().toISOString();
}

export class PostgresBackend {
  async init(): Promise<void> {
    try {
      await db.select({ count: sql<number>`count(*)` }).from(schema.users);
      console.log('[PostgresBackend] Connected to Cloud SQL PostgreSQL.');
    } catch (err) {
      console.error('[PostgresBackend] Connection check failed:', err);
      throw new Error('Cloud SQL PostgreSQL connection failed', { cause: err });
    }
  }

  // ---------------- Authentication & Users ----------------

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    try {
      const rows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email.toLowerCase().trim()))
        .limit(1);

      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        full_name: r.fullName,
        email: r.email,
        password_hash: r.passwordHash,
        course: r.course || '',
        stream: r.stream || '',
        college: r.college || '',
        university: r.university || '',
        is_profile_completed: Boolean(r.isProfileCompleted),
        created_at: toIsoString(r.createdAt),
      };
    } catch (error) {
      console.error('[PostgresBackend] findUserByEmail failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async createUser(params: {
    fullName: string;
    email: string;
    passwordHash: string;
    uid?: string;
    course?: string;
    stream?: string;
    college?: string;
    university?: string;
    isProfileCompleted?: boolean;
  }): Promise<PublicUser> {
    try {
      const emailLower = params.email.toLowerCase().trim();
      const [user] = await db
        .insert(schema.users)
        .values({
          fullName: params.fullName.trim(),
          email: emailLower,
          passwordHash: params.passwordHash || '',
          uid: params.uid || null,
          course: params.course || '',
          stream: params.stream || '',
          college: params.college || '',
          university: params.university || '',
          isProfileCompleted: Boolean(params.isProfileCompleted),
        })
        .returning();

      return {
        id: user.id,
        full_name: user.fullName,
        email: user.email,
        course: user.course || '',
        stream: user.stream || '',
        college: user.college || '',
        university: user.university || '',
        is_profile_completed: Boolean(user.isProfileCompleted),
        created_at: toIsoString(user.createdAt),
      };
    } catch (error) {
      console.error('[PostgresBackend] createUser failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async updateUserProfile(
    userId: number,
    profile: {
      fullName?: string;
      course: string;
      stream: string;
      college: string;
      university: string;
    }
  ): Promise<PublicUser> {
    try {
      const updateData: Record<string, unknown> = {
        course: profile.course.trim(),
        stream: profile.stream.trim(),
        college: profile.college.trim(),
        university: profile.university.trim(),
        isProfileCompleted: true,
      };

      if (profile.fullName && profile.fullName.trim()) {
        updateData.fullName = profile.fullName.trim();
      }

      const [updated] = await db
        .update(schema.users)
        .set(updateData)
        .where(eq(schema.users.id, userId))
        .returning();

      if (!updated) {
        throw new Error(`User with ID ${userId} not found.`);
      }

      // Sync user profile info to their authored notes for the central library
      await db
        .update(schema.notes)
        .set({
          authorName: updated.fullName,
          authorCollege: updated.college,
          authorUniversity: updated.university,
          authorCourse: updated.course,
          authorStream: updated.stream,
        })
        .where(eq(schema.notes.userId, userId));

      return {
        id: updated.id,
        full_name: updated.fullName,
        email: updated.email,
        course: updated.course || '',
        stream: updated.stream || '',
        college: updated.college || '',
        university: updated.university || '',
        is_profile_completed: Boolean(updated.isProfileCompleted),
        created_at: toIsoString(updated.createdAt),
      };
    } catch (error) {
      console.error('[PostgresBackend] updateUserProfile failed:', error);
      throw new Error('Failed to update user profile', { cause: error });
    }
  }

  async createSession(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
    try {
      await db.insert(schema.userSessions).values({
        userId,
        tokenHash,
        expiresAt,
      });
    } catch (error) {
      console.error('[PostgresBackend] createSession failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async getUserBySessionTokenHash(tokenHash: string): Promise<PublicUser | null> {
    try {
      const rows = await db
        .select({
          id: schema.users.id,
          fullName: schema.users.fullName,
          email: schema.users.email,
          course: schema.users.course,
          stream: schema.users.stream,
          college: schema.users.college,
          university: schema.users.university,
          isProfileCompleted: schema.users.isProfileCompleted,
          createdAt: schema.users.createdAt,
        })
        .from(schema.userSessions)
        .innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
        .where(
          and(
            eq(schema.userSessions.tokenHash, tokenHash),
            gt(schema.userSessions.expiresAt, new Date())
          )
        )
        .limit(1);

      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        full_name: r.fullName,
        email: r.email,
        course: r.course || '',
        stream: r.stream || '',
        college: r.college || '',
        university: r.university || '',
        is_profile_completed: Boolean(r.isProfileCompleted),
        created_at: toIsoString(r.createdAt),
      };
    } catch (error) {
      console.error('[PostgresBackend] getUserBySessionTokenHash failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    try {
      await db
        .delete(schema.userSessions)
        .where(eq(schema.userSessions.tokenHash, tokenHash));
    } catch (error) {
      console.error('[PostgresBackend] deleteSessionByTokenHash failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  // ---------------- Notes, Deduplication & Storage Optimization ----------------

  async checkDuplicateNote(contentHash: string): Promise<NoteRecord | null> {
    if (!contentHash) return null;
    try {
      const rows = await db
        .select()
        .from(schema.notes)
        .where(
          and(
            eq(schema.notes.contentHash, contentHash),
            eq(schema.notes.isDuplicate, false)
          )
        )
        .limit(1);

      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        user_id: r.userId,
        title: r.title,
        topic: r.topic,
        file_type: r.fileType,
        original_filename: r.originalFilename,
        content: r.content,
        char_count: r.charCount,
        word_count: r.wordCount,
        content_hash: r.contentHash,
        is_shared: r.isShared,
        author_name: r.authorName || '',
        author_college: r.authorCollege || '',
        author_university: r.authorUniversity || '',
        author_course: r.authorCourse || '',
        author_stream: r.authorStream || '',
        is_duplicate: r.isDuplicate,
        canonical_note_id: r.canonicalNoteId,
        created_at: toIsoString(r.createdAt),
      };
    } catch (err) {
      console.warn('[PostgresBackend] checkDuplicateNote check failed:', err);
      return null;
    }
  }

  async createNote(params: {
    userId: number;
    title: string;
    topic: string;
    fileType: string;
    originalFilename: string | null;
    content: string;
    authorName?: string;
    authorCollege?: string;
    authorUniversity?: string;
    authorCourse?: string;
    authorStream?: string;
  }): Promise<NoteRecord & { sections: NoteSection[]; storage_saved?: boolean }> {
    try {
      const content = params.content.trim();
      const charCount = content.length;
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      const contentHash = computeContentHash(content);

      // Check if an identical note has already been uploaded by ANY user
      const existingCanonical = await this.checkDuplicateNote(contentHash);

      if (existingCanonical) {
        console.log(
          `[Dedup] Identical note detected! Reusing canonical note ID ${existingCanonical.id}. Saving storage.`
        );

        // Fetch sections from canonical note to return to user without duplicate insertion
        const secRows = await db
          .select()
          .from(schema.noteSections)
          .where(eq(schema.noteSections.noteId, existingCanonical.id))
          .orderBy(asc(schema.noteSections.sectionIndex));

        // STORAGE OPTIMIZATION:
        // We store an empty content string in this row and link to canonicalNoteId,
        // saving 100% of the long-text storage in PostgreSQL!
        const [note] = await db
          .insert(schema.notes)
          .values({
            userId: params.userId,
            title: params.title,
            topic: params.topic,
            fileType: params.fileType,
            originalFilename: params.originalFilename,
            content: '', // Empty: points to canonicalNoteId
            charCount,
            wordCount,
            contentHash,
            isShared: true,
            authorName: params.authorName || '',
            authorCollege: params.authorCollege || '',
            authorUniversity: params.authorUniversity || '',
            authorCourse: params.authorCourse || '',
            authorStream: params.authorStream || '',
            isDuplicate: true,
            canonicalNoteId: existingCanonical.id,
          })
          .returning();

        const sections: NoteSection[] = secRows.map((s) => ({
          id: s.id,
          note_id: note.id,
          user_id: params.userId,
          section_index: s.sectionIndex,
          title: s.title,
          content: s.content,
          start_char: s.startChar,
          end_char: s.endChar,
        }));

        return {
          id: note.id,
          user_id: note.userId,
          title: note.title,
          topic: note.topic,
          file_type: note.fileType,
          original_filename: note.originalFilename,
          content: existingCanonical.content, // Provide full content to client
          char_count: charCount,
          word_count: wordCount,
          content_hash: contentHash,
          is_shared: true,
          is_duplicate: true,
          canonical_note_id: existingCanonical.id,
          storage_saved: true,
          created_at: toIsoString(note.createdAt),
          sections,
        };
      }

      // New unique note: parse sections and insert
      const parsedSections = processTextIntoSections(content);
      const [note] = await db
        .insert(schema.notes)
        .values({
          userId: params.userId,
          title: params.title,
          topic: params.topic,
          fileType: params.fileType,
          originalFilename: params.originalFilename,
          content,
          charCount,
          wordCount,
          contentHash,
          isShared: true,
          authorName: params.authorName || '',
          authorCollege: params.authorCollege || '',
          authorUniversity: params.authorUniversity || '',
          authorCourse: params.authorCourse || '',
          authorStream: params.authorStream || '',
          isDuplicate: false,
          canonicalNoteId: null,
        })
        .returning();

      let createdSections: NoteSection[] = [];
      if (parsedSections.length > 0) {
        const secValues = parsedSections.map((sec) => ({
          noteId: note.id,
          userId: params.userId,
          sectionIndex: sec.index,
          title: sec.title,
          content: sec.content,
          startChar: sec.start_char,
          endChar: sec.end_char,
        }));

        const inserted = await db.insert(schema.noteSections).values(secValues).returning();
        createdSections = inserted.map((s) => ({
          id: s.id,
          note_id: s.noteId,
          user_id: s.userId,
          section_index: s.sectionIndex,
          title: s.title,
          content: s.content,
          start_char: s.startChar,
          end_char: s.endChar,
        }));
      }

      return {
        id: note.id,
        user_id: note.userId,
        title: note.title,
        topic: note.topic,
        file_type: note.fileType,
        original_filename: note.originalFilename,
        content: note.content,
        char_count: note.charCount,
        word_count: note.wordCount,
        content_hash: contentHash,
        is_shared: true,
        is_duplicate: false,
        canonical_note_id: null,
        storage_saved: false,
        created_at: toIsoString(note.createdAt),
        sections: createdSections,
      };
    } catch (error) {
      console.error('[PostgresBackend] createNote failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async listNotes(userId: number): Promise<Omit<NoteRecord, 'content'>[]> {
    try {
      const rows = await db
        .select({
          id: schema.notes.id,
          userId: schema.notes.userId,
          title: schema.notes.title,
          topic: schema.notes.topic,
          fileType: schema.notes.fileType,
          originalFilename: schema.notes.originalFilename,
          charCount: schema.notes.charCount,
          wordCount: schema.notes.wordCount,
          contentHash: schema.notes.contentHash,
          isDuplicate: schema.notes.isDuplicate,
          canonicalNoteId: schema.notes.canonicalNoteId,
          createdAt: schema.notes.createdAt,
        })
        .from(schema.notes)
        .where(eq(schema.notes.userId, userId))
        .orderBy(desc(schema.notes.id));

      return rows.map((r) => ({
        id: r.id,
        user_id: r.userId,
        title: r.title,
        topic: r.topic,
        file_type: r.fileType,
        original_filename: r.originalFilename,
        char_count: r.charCount,
        word_count: r.wordCount,
        content_hash: r.contentHash,
        is_duplicate: r.isDuplicate,
        canonical_note_id: r.canonicalNoteId,
        storage_saved: r.isDuplicate,
        created_at: toIsoString(r.createdAt),
      }));
    } catch (error) {
      console.error('[PostgresBackend] listNotes failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async listNotesWithContent(userId: number): Promise<NoteRecord[]> {
    try {
      const rows = await db
        .select()
        .from(schema.notes)
        .where(eq(schema.notes.userId, userId))
        .orderBy(desc(schema.notes.id));

      const notesOut: NoteRecord[] = [];
      for (const r of rows) {
        let content = r.content;
        // If deduplicated, fetch content from canonical note
        if (r.isDuplicate && r.canonicalNoteId) {
          const [canonical] = await db
            .select({ content: schema.notes.content })
            .from(schema.notes)
            .where(eq(schema.notes.id, r.canonicalNoteId))
            .limit(1);
          if (canonical) {
            content = canonical.content;
          }
        }

        notesOut.push({
          id: r.id,
          user_id: r.userId,
          title: r.title,
          topic: r.topic,
          file_type: r.fileType,
          original_filename: r.originalFilename,
          content,
          char_count: r.charCount,
          word_count: r.wordCount,
          content_hash: r.contentHash,
          is_duplicate: r.isDuplicate,
          canonical_note_id: r.canonicalNoteId,
          storage_saved: r.isDuplicate,
          created_at: toIsoString(r.createdAt),
        });
      }

      return notesOut;
    } catch (error) {
      console.error('[PostgresBackend] listNotesWithContent failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async getNoteDetail(
    userId: number,
    noteId: number
  ): Promise<(NoteRecord & { sections: NoteSection[] }) | null> {
    try {
      const noteRows = await db
        .select()
        .from(schema.notes)
        .where(and(eq(schema.notes.id, noteId), eq(schema.notes.userId, userId)))
        .limit(1);

      if (noteRows.length === 0) return null;
      const note = noteRows[0];

      let effectiveContent = note.content;
      let effectiveNoteIdForSections = note.id;

      // If duplicate, retrieve full content & sections from canonical note
      if (note.isDuplicate && note.canonicalNoteId) {
        const [canonical] = await db
          .select({ content: schema.notes.content })
          .from(schema.notes)
          .where(eq(schema.notes.id, note.canonicalNoteId))
          .limit(1);
        if (canonical) {
          effectiveContent = canonical.content;
          effectiveNoteIdForSections = note.canonicalNoteId;
        }
      }

      const secRows = await db
        .select()
        .from(schema.noteSections)
        .where(eq(schema.noteSections.noteId, effectiveNoteIdForSections))
        .orderBy(asc(schema.noteSections.sectionIndex));

      return {
        id: note.id,
        user_id: note.userId,
        title: note.title,
        topic: note.topic,
        file_type: note.fileType,
        original_filename: note.originalFilename,
        content: effectiveContent,
        char_count: note.charCount,
        word_count: note.wordCount,
        content_hash: note.contentHash,
        is_duplicate: note.isDuplicate,
        canonical_note_id: note.canonicalNoteId,
        storage_saved: note.isDuplicate,
        created_at: toIsoString(note.createdAt),
        sections: secRows.map((s) => ({
          id: s.id,
          note_id: note.id,
          user_id: note.userId,
          section_index: s.sectionIndex,
          title: s.title,
          content: s.content,
          start_char: s.startChar,
          end_char: s.endChar,
        })),
      };
    } catch (error) {
      console.error('[PostgresBackend] getNoteDetail failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async deleteNote(userId: number, noteId: number): Promise<boolean> {
    try {
      const deleted = await db
        .delete(schema.notes)
        .where(and(eq(schema.notes.id, noteId), eq(schema.notes.userId, userId)))
        .returning({ id: schema.notes.id });

      return deleted.length > 0;
    } catch (error) {
      console.error('[PostgresBackend] deleteNote failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  // ---------------- Central Library (Peer Notes Sharing) ----------------

  async listCentralLibrary(
    currentUserId: number,
    filter = 'all',
    search = ''
  ): Promise<Array<NoteRecord & { relevance_badge: string; relevance_score: number }>> {
    try {
      // 1. Fetch current user's profile to compute relevance matching
      const [currentUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, currentUserId))
        .limit(1);

      const userCollege = (currentUser?.college || '').trim().toLowerCase();
      const userUniversity = (currentUser?.university || '').trim().toLowerCase();
      const userCourse = (currentUser?.course || '').trim().toLowerCase();
      const userStream = (currentUser?.stream || '').trim().toLowerCase();

      // 2. Fetch all shared notes from OTHER users (where is_shared = true and is_duplicate = false to avoid duplicate cards)
      const rows = await db
        .select({
          id: schema.notes.id,
          userId: schema.notes.userId,
          title: schema.notes.title,
          topic: schema.notes.topic,
          fileType: schema.notes.fileType,
          originalFilename: schema.notes.originalFilename,
          content: schema.notes.content,
          charCount: schema.notes.charCount,
          wordCount: schema.notes.wordCount,
          contentHash: schema.notes.contentHash,
          authorName: schema.notes.authorName,
          authorCollege: schema.notes.authorCollege,
          authorUniversity: schema.notes.authorUniversity,
          authorCourse: schema.notes.authorCourse,
          authorStream: schema.notes.authorStream,
          createdAt: schema.notes.createdAt,
          userFullName: schema.users.fullName,
          userCollegeCol: schema.users.college,
          userUnivCol: schema.users.university,
          userCourseCol: schema.users.course,
          userStreamCol: schema.users.stream,
        })
        .from(schema.notes)
        .innerJoin(schema.users, eq(schema.users.id, schema.notes.userId))
        .where(
          and(
            ne(schema.notes.userId, currentUserId),
            eq(schema.notes.isShared, true),
            eq(schema.notes.isDuplicate, false)
          )
        )
        .orderBy(desc(schema.notes.id));

      const searchLower = (search || '').trim().toLowerCase();

      // 3. Score and filter according to user's profile
      const scoredList: Array<NoteRecord & { relevance_badge: string; relevance_score: number }> = [];

      for (const r of rows) {
        const authorCollege = (r.authorCollege || r.userCollegeCol || '').trim().toLowerCase();
        const authorUniversity = (r.authorUniversity || r.userUnivCol || '').trim().toLowerCase();
        const authorCourse = (r.authorCourse || r.userCourseCol || '').trim().toLowerCase();
        const authorStream = (r.authorStream || r.userStreamCol || '').trim().toLowerCase();
        const authorName = r.authorName || r.userFullName || 'Peer Student';

        // Search text matching
        if (searchLower) {
          const matchTitle = r.title.toLowerCase().includes(searchLower);
          const matchTopic = r.topic.toLowerCase().includes(searchLower);
          const matchContent = r.content.slice(0, 1000).toLowerCase().includes(searchLower);
          const matchCollege = authorCollege.includes(searchLower);
          const matchCourse = authorCourse.includes(searchLower);
          if (!matchTitle && !matchTopic && !matchContent && !matchCollege && !matchCourse) {
            continue;
          }
        }

        // Relevance scoring
        let score = 10; // Baseline
        let badge = 'General Academic';

        const sameCollege = userCollege && authorCollege && userCollege === authorCollege;
        const sameUniv = userUniversity && authorUniversity && userUniversity === authorUniversity;
        const sameCourse = userCourse && authorCourse && userCourse === authorCourse;
        const sameStream = userStream && authorStream && userStream === authorStream;

        if (sameCollege && sameCourse) {
          score += 60;
          badge = `🎓 Same College & Course (${r.authorCollege || r.userCollegeCol})`;
        } else if (sameCollege) {
          score += 45;
          badge = `🏛️ Same College (${r.authorCollege || r.userCollegeCol})`;
        } else if (sameUniv && sameCourse) {
          score += 40;
          badge = `📚 Same University & Course (${r.authorUniversity || r.userUnivCol})`;
        } else if (sameUniv) {
          score += 30;
          badge = `🏫 Same University (${r.authorUniversity || r.userUnivCol})`;
        } else if (sameCourse) {
          score += 25;
          badge = `📖 Same Course (${r.authorCourse || r.userCourseCol})`;
        } else if (sameStream) {
          score += 20;
          badge = `🔬 Same Stream (${r.authorStream || r.userStreamCol})`;
        }

        // Apply filter mode
        if (filter === 'college' && !sameCollege) continue;
        if (filter === 'university' && !sameUniv) continue;
        if (filter === 'course' && !sameCourse) continue;
        if (filter === 'stream' && !sameStream) continue;

        scoredList.push({
          id: r.id,
          user_id: r.userId,
          title: r.title,
          topic: r.topic,
          file_type: r.fileType,
          original_filename: r.originalFilename,
          content: r.content,
          char_count: r.charCount,
          word_count: r.wordCount,
          content_hash: r.contentHash,
          author_name: authorName,
          author_college: r.authorCollege || r.userCollegeCol || '',
          author_university: r.authorUniversity || r.userUnivCol || '',
          author_course: r.authorCourse || r.userCourseCol || '',
          author_stream: r.authorStream || r.userStreamCol || '',
          created_at: toIsoString(r.createdAt),
          relevance_badge: badge,
          relevance_score: score,
        });
      }

      // Sort by highest relevance score first, then newest
      scoredList.sort((a, b) => b.relevance_score - a.relevance_score || b.id - a.id);
      return scoredList;
    } catch (error) {
      console.error('[PostgresBackend] listCentralLibrary failed:', error);
      throw new Error('Failed to retrieve Central Library notes', { cause: error });
    }
  }

  async cloneNoteToUser(
    targetUserId: number,
    sourceNoteId: number
  ): Promise<NoteRecord> {
    try {
      const [srcNote] = await db
        .select()
        .from(schema.notes)
        .where(eq(schema.notes.id, sourceNoteId))
        .limit(1);

      if (!srcNote) {
        throw new Error(`Note ${sourceNoteId} not found.`);
      }

      // Check if user already has this note in their library
      const existing = await db
        .select()
        .from(schema.notes)
        .where(
          and(
            eq(schema.notes.userId, targetUserId),
            or(
              eq(schema.notes.canonicalNoteId, srcNote.id),
              eq(schema.notes.contentHash, srcNote.contentHash)
            )
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const e = existing[0];
        return {
          id: e.id,
          user_id: e.userId,
          title: e.title,
          topic: e.topic,
          file_type: e.fileType,
          original_filename: e.originalFilename,
          content: srcNote.content,
          char_count: e.charCount,
          word_count: e.wordCount,
          content_hash: e.contentHash,
          is_duplicate: true,
          canonical_note_id: srcNote.id,
          storage_saved: true,
          created_at: toIsoString(e.createdAt),
        };
      }

      // Insert deduplicated reference for the target user (saves storage!)
      const [cloned] = await db
        .insert(schema.notes)
        .values({
          userId: targetUserId,
          title: srcNote.title,
          topic: srcNote.topic,
          fileType: srcNote.fileType,
          originalFilename: srcNote.originalFilename,
          content: '', // Reuses srcNote content
          charCount: srcNote.charCount,
          wordCount: srcNote.wordCount,
          contentHash: srcNote.contentHash,
          isShared: false,
          authorName: srcNote.authorName,
          authorCollege: srcNote.authorCollege,
          authorUniversity: srcNote.authorUniversity,
          authorCourse: srcNote.authorCourse,
          authorStream: srcNote.authorStream,
          isDuplicate: true,
          canonicalNoteId: srcNote.canonicalNoteId || srcNote.id,
        })
        .returning();

      return {
        id: cloned.id,
        user_id: cloned.userId,
        title: cloned.title,
        topic: cloned.topic,
        file_type: cloned.fileType,
        original_filename: cloned.originalFilename,
        content: srcNote.content,
        char_count: cloned.charCount,
        word_count: cloned.wordCount,
        content_hash: cloned.contentHash,
        is_duplicate: true,
        canonical_note_id: srcNote.id,
        storage_saved: true,
        created_at: toIsoString(cloned.createdAt),
      };
    } catch (error) {
      console.error('[PostgresBackend] cloneNoteToUser failed:', error);
      throw new Error('Failed to save note to library', { cause: error });
    }
  }

  // ---------------- Grounded Q&A History with Web Grounding ----------------

  async saveQaHistory(params: {
    userId: number;
    topicFilter: string | null;
    question: string;
    response: QuestionAnswerResponse;
  }): Promise<QaHistoryRecord> {
    try {
      const [inserted] = await db
        .insert(schema.qaHistory)
        .values({
          userId: params.userId,
          topicFilter: params.topicFilter,
          question: params.question,
          answer: params.response.answer,
          status: params.response.status,
          isSupported: params.response.is_supported,
          confidence: params.response.confidence,
          modelUsed: params.response.model_used,
          evidenceJson: JSON.stringify(params.response.evidence_list || []),
          notesConsultedJson: JSON.stringify(params.response.notes_consulted || []),
          searchGroundingUsed: Boolean(params.response.search_grounding_used),
          validityScore: params.response.validity_score ?? params.response.confidence,
          webSourcesJson: JSON.stringify(params.response.web_sources || []),
        })
        .returning();

      return {
        id: inserted.id,
        user_id: inserted.userId,
        topic_filter: inserted.topicFilter,
        question: inserted.question,
        answer: inserted.answer,
        status: inserted.status as 'SUPPORTED' | 'INSUFFICIENT_EVIDENCE' | 'WEB_GROUNDED',
        is_supported: inserted.isSupported,
        confidence: inserted.confidence,
        model_used: inserted.modelUsed,
        evidence_list: params.response.evidence_list || [],
        notes_consulted: params.response.notes_consulted || [],
        search_grounding_used: inserted.searchGroundingUsed,
        validity_score: inserted.validityScore,
        web_sources: params.response.web_sources || [],
        created_at: toIsoString(inserted.createdAt),
      };
    } catch (error) {
      console.error('[PostgresBackend] saveQaHistory failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async listQaHistory(userId: number, limit = 15): Promise<QaHistoryRecord[]> {
    try {
      const rows = await db
        .select()
        .from(schema.qaHistory)
        .where(eq(schema.qaHistory.userId, userId))
        .orderBy(desc(schema.qaHistory.id))
        .limit(limit);

      return rows.map((r) => {
        let evidenceList: EvidenceItem[] = [];
        let notesConsulted: string[] = [];
        let webSources: WebSourceItem[] = [];
        try {
          evidenceList = JSON.parse(r.evidenceJson || '[]');
        } catch {
          evidenceList = [];
        }
        try {
          notesConsulted = JSON.parse(r.notesConsultedJson || '[]');
        } catch {
          notesConsulted = [];
        }
        try {
          webSources = JSON.parse(r.webSourcesJson || '[]');
        } catch {
          webSources = [];
        }
        return {
          id: r.id,
          user_id: r.userId,
          topic_filter: r.topicFilter,
          question: r.question,
          answer: r.answer,
          status: r.status as 'SUPPORTED' | 'INSUFFICIENT_EVIDENCE' | 'WEB_GROUNDED',
          is_supported: r.isSupported,
          confidence: r.confidence,
          model_used: r.modelUsed,
          evidence_list: evidenceList,
          notes_consulted: notesConsulted,
          search_grounding_used: r.searchGroundingUsed,
          validity_score: r.validityScore,
          web_sources: webSources,
          created_at: toIsoString(r.createdAt),
        };
      });
    } catch (error) {
      console.error('[PostgresBackend] listQaHistory failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  // ---------------- Quizzes & Assessments ----------------

  async createQuiz(params: {
    userId: number;
    noteId: number | null;
    topic: string;
    title: string;
    difficulty: string;
    questions: Array<{
      question_order: number;
      question_text: string;
      option_a: string;
      option_b: string;
      option_c: string;
      option_d: string;
      correct_option: string;
      explanation: string;
      quote_evidence: string;
      revision_hint: string;
    }>;
  }) {
    try {
      const [quiz] = await db
        .insert(schema.quizzes)
        .values({
          userId: params.userId,
          noteId: params.noteId,
          topic: params.topic,
          title: params.title,
          difficulty: params.difficulty,
          questionCount: params.questions.length,
        })
        .returning();

      const qValues = params.questions.map((q) => ({
        quizId: quiz.id,
        questionOrder: q.question_order,
        questionText: q.question_text,
        optionA: q.option_a,
        optionB: q.option_b,
        optionC: q.option_c,
        optionD: q.option_d,
        correctOption: q.correct_option,
        explanation: q.explanation,
        quoteEvidence: q.quote_evidence,
        revisionHint: q.revision_hint,
      }));

      const insertedQuestions = await db.insert(schema.quizQuestions).values(qValues).returning();

      const publicQuestions = insertedQuestions.map((q) => ({
        id: q.id,
        question_order: q.questionOrder,
        question_text: q.questionText,
        options: {
          A: q.optionA,
          B: q.optionB,
          C: q.optionC,
          D: q.optionD,
        },
      }));

      return {
        id: quiz.id,
        user_id: quiz.userId,
        note_id: quiz.noteId,
        topic: quiz.topic,
        title: quiz.title,
        difficulty: quiz.difficulty,
        question_count: quiz.questionCount,
        created_at: toIsoString(quiz.createdAt),
        questions: publicQuestions,
      };
    } catch (error) {
      console.error('[PostgresBackend] createQuiz failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async listQuizzes(userId: number): Promise<QuizRecord[]> {
    try {
      const rows = await db
        .select()
        .from(schema.quizzes)
        .where(eq(schema.quizzes.userId, userId))
        .orderBy(desc(schema.quizzes.id));

      return rows.map((r) => ({
        id: r.id,
        user_id: r.userId,
        note_id: r.noteId,
        topic: r.topic,
        title: r.title,
        difficulty: r.difficulty,
        question_count: r.questionCount,
        created_at: toIsoString(r.createdAt),
      }));
    } catch (error) {
      console.error('[PostgresBackend] listQuizzes failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async getQuizPublic(userId: number, quizId: number) {
    try {
      const quizRows = await db
        .select()
        .from(schema.quizzes)
        .where(and(eq(schema.quizzes.id, quizId), eq(schema.quizzes.userId, userId)))
        .limit(1);

      if (quizRows.length === 0) return null;
      const quiz = quizRows[0];

      const qRows = await db
        .select()
        .from(schema.quizQuestions)
        .where(eq(schema.quizQuestions.quizId, quizId))
        .orderBy(asc(schema.quizQuestions.questionOrder));

      return {
        id: quiz.id,
        user_id: quiz.userId,
        note_id: quiz.noteId,
        topic: quiz.topic,
        title: quiz.title,
        difficulty: quiz.difficulty,
        question_count: quiz.questionCount,
        created_at: toIsoString(quiz.createdAt),
        questions: qRows.map((q) => ({
          id: q.id,
          question_order: q.questionOrder,
          question_text: q.questionText,
          options: {
            A: q.optionA,
            B: q.optionB,
            C: q.optionC,
            D: q.optionD,
          },
        })),
      };
    } catch (error) {
      console.error('[PostgresBackend] getQuizPublic failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async scoreQuizAttempt(
    userId: number,
    quizId: number,
    userAnswers: Array<{ question_id: number; selected_option: string }>,
    timeTakenSeconds = 0
  ) {
    try {
      const quizRows = await db
        .select()
        .from(schema.quizzes)
        .where(and(eq(schema.quizzes.id, quizId), eq(schema.quizzes.userId, userId)))
        .limit(1);

      if (quizRows.length === 0) {
        throw new Error(`Quiz with id ${quizId} not found.`);
      }
      const quiz = quizRows[0];

      const qRows = await db
        .select()
        .from(schema.quizQuestions)
        .where(eq(schema.quizQuestions.quizId, quizId))
        .orderBy(asc(schema.quizQuestions.questionOrder));

      let linkedNote: { title: string; content: string } | null = null;
      if (quiz.noteId) {
        const noteRows = await db
          .select({ title: schema.notes.title, content: schema.notes.content, isDuplicate: schema.notes.isDuplicate, canonicalNoteId: schema.notes.canonicalNoteId })
          .from(schema.notes)
          .where(and(eq(schema.notes.id, quiz.noteId), eq(schema.notes.userId, userId)))
          .limit(1);
        if (noteRows.length > 0) {
          let text = noteRows[0].content;
          if (noteRows[0].isDuplicate && noteRows[0].canonicalNoteId) {
            const [can] = await db
              .select({ content: schema.notes.content })
              .from(schema.notes)
              .where(eq(schema.notes.id, noteRows[0].canonicalNoteId))
              .limit(1);
            if (can) text = can.content;
          }
          linkedNote = { title: noteRows[0].title, content: text };
        }
      }

      const answersMap = new Map<number, string>();
      for (const a of userAnswers) {
        answersMap.set(Number(a.question_id), (a.selected_option || '').trim().toUpperCase());
      }

      let correctCount = 0;
      const totalQuestions = qRows.length;
      const results = qRows.map((q) => {
        const qId = q.id;
        const userChoice = answersMap.get(qId) || '';
        const correctOption = q.correctOption;
        const isCorrect = userChoice === correctOption;
        if (isCorrect) correctCount += 1;

        const quoteEv = q.quoteEvidence || '';
        let verification = null;
        if (quoteEv && linkedNote) {
          const verRes = verifyQuoteInText(quoteEv, linkedNote.content);
          verification = {
            quote: quoteEv,
            verified: verRes.verified,
            match_percentage: verRes.match_percentage,
            start_char: verRes.start_char,
            end_char: verRes.end_char,
            surrounding_passage: verRes.surrounding_passage,
            line_number: verRes.line_number,
            note_title: linkedNote.title,
            section_title: quiz.topic,
            status: verRes.status,
          };
        }

        return {
          question_id: qId,
          question_text: q.questionText,
          selected_option: userChoice,
          correct_option: correctOption,
          is_correct: isCorrect,
          explanation: q.explanation || '',
          quote_evidence: quoteEv,
          evidence_verification: verification,
          revision_hint: q.revisionHint || '',
        };
      });

      const scorePct =
        totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 1000) / 10 : 0.0;

      const [attempt] = await db
        .insert(schema.quizAttempts)
        .values({
          userId,
          quizId,
          totalQuestions,
          score: correctCount,
          scorePercentage: scorePct,
          timeTakenSeconds,
        })
        .returning();

      const answerValues = results.map((r) => ({
        attemptId: attempt.id,
        questionId: r.question_id,
        selectedOption: r.selected_option,
        isCorrect: r.is_correct,
        revisionHint: r.revision_hint,
      }));

      await db.insert(schema.quizAttemptAnswers).values(answerValues);

      const topicStr = quiz.topic;
      const progRows = await db
        .select()
        .from(schema.learningProgress)
        .where(
          and(
            eq(schema.learningProgress.userId, userId),
            eq(schema.learningProgress.topic, topicStr)
          )
        )
        .limit(1);

      if (progRows.length > 0) {
        const oldAttempts = progRows[0].totalAttempts;
        const oldAvg = progRows[0].avgScore;
        const newAttempts = oldAttempts + 1;
        const newAvg =
          Math.round(((oldAvg * oldAttempts + scorePct) / newAttempts) * 10) / 10;
        const mastery =
          newAvg >= 85 ? 'Mastered' : newAvg >= 70 ? 'Proficient' : 'Needs Practice';

        await db
          .update(schema.learningProgress)
          .set({
            totalAttempts: newAttempts,
            avgScore: newAvg,
            masteryLevel: mastery,
            lastPracticedAt: new Date(),
          })
          .where(
            and(
              eq(schema.learningProgress.userId, userId),
              eq(schema.learningProgress.topic, topicStr)
            )
          );
      } else {
        const mastery =
          scorePct >= 85 ? 'Mastered' : scorePct >= 70 ? 'Proficient' : 'Needs Practice';

        await db.insert(schema.learningProgress).values({
          userId,
          topic: topicStr,
          totalAttempts: 1,
          avgScore: scorePct,
          masteryLevel: mastery,
        });
      }

      let summaryFeedback: string;
      if (scorePct === 100.0) {
        summaryFeedback =
          'Outstanding! You scored 100% and demonstrated flawless mastery of this topic.';
      } else if (scorePct >= 75.0) {
        summaryFeedback = `Great work! You scored ${scorePct}%. Review the revision hints below for any missed questions to solidify your knowledge.`;
      } else {
        summaryFeedback = `You scored ${scorePct}%. We recommend reviewing the targeted evidence passages and taking another practice quiz.`;
      }

      return {
        attempt_id: attempt.id,
        quiz_id: quizId,
        score: correctCount,
        total_questions: totalQuestions,
        score_percentage: scorePct,
        time_taken_seconds: timeTakenSeconds,
        results,
        summary_feedback: summaryFeedback,
      };
    } catch (error) {
      console.error('[PostgresBackend] scoreQuizAttempt failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async getAttemptDetail(userId: number, attemptId: number) {
    try {
      const attRows = await db
        .select()
        .from(schema.quizAttempts)
        .where(
          and(
            eq(schema.quizAttempts.id, attemptId),
            eq(schema.quizAttempts.userId, userId)
          )
        )
        .limit(1);

      if (attRows.length === 0) return null;
      const att = attRows[0];

      const ansRows = await db
        .select({
          questionId: schema.quizAttemptAnswers.questionId,
          selectedOption: schema.quizAttemptAnswers.selectedOption,
          isCorrect: schema.quizAttemptAnswers.isCorrect,
          revisionHint: schema.quizAttemptAnswers.revisionHint,
          questionText: schema.quizQuestions.questionText,
          correctOption: schema.quizQuestions.correctOption,
          explanation: schema.quizQuestions.explanation,
          quoteEvidence: schema.quizQuestions.quoteEvidence,
        })
        .from(schema.quizAttemptAnswers)
        .innerJoin(
          schema.quizQuestions,
          eq(schema.quizQuestions.id, schema.quizAttemptAnswers.questionId)
        )
        .where(eq(schema.quizAttemptAnswers.attemptId, attemptId))
        .orderBy(asc(schema.quizQuestions.questionOrder));

      const results = ansRows.map((r) => ({
        question_id: r.questionId,
        question_text: r.questionText,
        selected_option: r.selectedOption,
        correct_option: r.correctOption,
        is_correct: r.isCorrect,
        explanation: r.explanation,
        quote_evidence: r.quoteEvidence,
        evidence_verification: null,
        revision_hint: r.revisionHint,
      }));

      const completedIso = toIsoString(att.completedAt);
      return {
        attempt_id: att.id,
        quiz_id: att.quizId,
        score: att.score,
        total_questions: att.totalQuestions,
        score_percentage: att.scorePercentage,
        time_taken_seconds: att.timeTakenSeconds,
        results,
        summary_feedback: `Reviewing attempt from ${new Date(completedIso).toLocaleString()}.`,
      };
    } catch (error) {
      console.error('[PostgresBackend] getAttemptDetail failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }

  async getDashboardAnalytics(userId: number) {
    try {
      const [noteCountRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.notes)
        .where(eq(schema.notes.userId, userId));
      const totalNotes = Number(noteCountRow?.count || 0);

      const [attAggRow] = await db
        .select({
          count: sql<number>`count(*)`,
          totalCorrect: sql<number>`coalesce(sum(${schema.quizAttempts.score}), 0)`,
          totalQs: sql<number>`coalesce(sum(${schema.quizAttempts.totalQuestions}), 0)`,
        })
        .from(schema.quizAttempts)
        .where(eq(schema.quizAttempts.userId, userId));

      const totalAttempts = Number(attAggRow?.count || 0);
      const totalCorrect = Number(attAggRow?.totalCorrect || 0);
      const totalQs = Number(attAggRow?.totalQs || 0);
      const overallAccuracy =
        totalQs > 0 ? Math.round((totalCorrect / totalQs) * 1000) / 10 : 0.0;

      const progRows = await db
        .select()
        .from(schema.learningProgress)
        .where(eq(schema.learningProgress.userId, userId))
        .orderBy(desc(schema.learningProgress.avgScore));

      const topicMastery = progRows.map((pr) => {
        let rec: string;
        if (pr.avgScore >= 85) {
          rec = 'Topic mastered! Challenge yourself with advanced follow-up assessments.';
        } else if (pr.avgScore >= 70) {
          rec = 'Solid comprehension. Review targeted quote passages to achieve top mastery.';
        } else {
          rec = 'Priority review area: review evidence inspector quotes and re-take practice quiz.';
        }
        return {
          topic: pr.topic,
          attempts: pr.totalAttempts,
          avg_score: pr.avgScore,
          mastery_level: pr.masteryLevel,
          recommendation: rec,
        };
      });

      const adaptiveRecs: string[] = [];
      const weakTopics = progRows
        .filter((pr) => pr.avgScore < 75)
        .sort((a, b) => a.avgScore - b.avgScore);

      for (const w of weakTopics) {
        adaptiveRecs.push(
          `Focus revision on '${w.topic}': your average accuracy is ${w.avgScore}%. Review key concept definitions and take a targeted quiz.`
        );
      }

      const wrongRows = await db
        .select({
          revisionHint: schema.quizAttemptAnswers.revisionHint,
          topic: schema.quizzes.topic,
        })
        .from(schema.quizAttemptAnswers)
        .innerJoin(
          schema.quizAttempts,
          eq(schema.quizAttempts.id, schema.quizAttemptAnswers.attemptId)
        )
        .innerJoin(schema.quizzes, eq(schema.quizzes.id, schema.quizAttempts.quizId))
        .where(
          and(
            eq(schema.quizAttempts.userId, userId),
            eq(schema.quizAttemptAnswers.isCorrect, false)
          )
        )
        .orderBy(desc(schema.quizAttemptAnswers.id))
        .limit(3);

      for (const rw of wrongRows) {
        if (rw.revisionHint) {
          const msg = `Targeted Hint (${rw.topic}): ${rw.revisionHint}`;
          if (!adaptiveRecs.includes(msg)) {
            adaptiveRecs.push(msg);
          }
        }
      }

      if (adaptiveRecs.length === 0) {
        if (totalNotes === 0) {
          adaptiveRecs.push(
            'Welcome to your workspace! Upload a PDF, TXT note, or handwritten note photo to begin.'
          );
        } else if (totalAttempts === 0) {
          adaptiveRecs.push(
            'Ready to begin: Select a note and take your first AI-generated quiz to establish a baseline.'
          );
          adaptiveRecs.push(
            'Use the Grounded Q&A tab to ask questions; web search grounding automatically activates if notes are insufficient.'
          );
        } else {
          adaptiveRecs.push(
            'Great progress across all topics! Check the Central Library to study peer notes from your college and course.'
          );
        }
      }

      const recentRows = await db
        .select({
          attemptId: schema.quizAttempts.id,
          quizId: schema.quizAttempts.quizId,
          quizTitle: schema.quizzes.title,
          topic: schema.quizzes.topic,
          score: schema.quizAttempts.score,
          totalQuestions: schema.quizAttempts.totalQuestions,
          scorePercentage: schema.quizAttempts.scorePercentage,
          completedAt: schema.quizAttempts.completedAt,
        })
        .from(schema.quizAttempts)
        .leftJoin(schema.quizzes, eq(schema.quizzes.id, schema.quizAttempts.quizId))
        .where(eq(schema.quizAttempts.userId, userId))
        .orderBy(desc(schema.quizAttempts.id))
        .limit(10);

      const recentAttempts = recentRows.map((r) => ({
        attempt_id: r.attemptId,
        quiz_id: r.quizId,
        quiz_title: r.quizTitle || `Quiz #${r.quizId}`,
        topic: r.topic || 'General',
        score: r.score,
        total_questions: r.totalQuestions,
        score_percentage: r.scorePercentage,
        completed_at: toIsoString(r.completedAt),
      }));

      return {
        total_notes: totalNotes,
        total_quizzes_taken: totalAttempts,
        overall_accuracy: overallAccuracy,
        topic_mastery: topicMastery,
        adaptive_recommendations: adaptiveRecs,
        recent_attempts: recentAttempts,
      };
    } catch (error) {
      console.error('[PostgresBackend] getDashboardAnalytics failed:', error);
      throw new Error('Database query failed', { cause: error });
    }
  }
}
