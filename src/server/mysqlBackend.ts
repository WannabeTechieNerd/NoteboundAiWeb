import mysql from 'mysql2/promise';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
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
} from './types.ts';
import { processTextIntoSections, verifyQuoteInText } from './documentService.ts';

function sanitizeIdentifier(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '');
  return cleaned || 'notebound_ai';
}

function toIsoString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') {
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? val : parsed.toISOString();
  }
  return new Date().toISOString();
}

export class MySQLBackend {
  private pool: Pool | null = null;
  private dbName: string;

  constructor() {
    this.dbName = sanitizeIdentifier(process.env.MYSQL_DATABASE || 'notebound_ai');
  }

  async init(): Promise<void> {
    const host = (process.env.MYSQL_HOST || '').trim();
    if (!host) {
      throw new Error('MYSQL_HOST is not set.');
    }

    const port = Number(process.env.MYSQL_PORT || 3306);
    const user = process.env.MYSQL_USER || 'root';
    const password = process.env.MYSQL_PASSWORD || '';
    const useSsl = String(process.env.MYSQL_SSL || 'false').toLowerCase() === 'true';
    const sslConfig = useSsl ? { rejectUnauthorized: false } : undefined;

    // 1. Ensure target database exists
    const bootstrapConn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      connectTimeout: 5000,
      ssl: sslConfig,
    });

    try {
      await bootstrapConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${this.dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } finally {
      await bootstrapConn.end();
    }

    // 2. Create connection pool bound to target database
    this.pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database: this.dbName,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 8000,
      charset: 'utf8mb4',
      ssl: sslConfig,
    });

    // 3. Ensure all per-user tables exist
    await this.ensureSchema();
  }

  private getPool(): Pool {
    if (!this.pool) {
      throw new Error('MySQL pool has not been initialized.');
    }
    return this.pool;
  }

  private async ensureSchema(): Promise<void> {
    const p = this.getPool();

    await p.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        full_name VARCHAR(150) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT UNSIGNED NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_sessions_token_hash (token_hash),
        KEY idx_sessions_user_id (user_id),
        CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT UNSIGNED NOT NULL,
        title VARCHAR(500) NOT NULL,
        topic VARCHAR(255) NOT NULL,
        file_type VARCHAR(32) NOT NULL DEFAULT 'txt',
        original_filename VARCHAR(500) NULL,
        content LONGTEXT NOT NULL,
        char_count INT UNSIGNED NOT NULL DEFAULT 0,
        word_count INT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_notes_user_created (user_id, id),
        KEY idx_notes_user_topic (user_id, topic),
        CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS note_sections (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        note_id INT UNSIGNED NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        section_index INT NOT NULL,
        title VARCHAR(500) NOT NULL,
        content LONGTEXT NOT NULL,
        start_char INT NOT NULL DEFAULT 0,
        end_char INT NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        KEY idx_sections_note_order (note_id, section_index),
        CONSTRAINT fk_sections_note FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
        CONSTRAINT fk_sections_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT UNSIGNED NOT NULL,
        note_id INT UNSIGNED NULL,
        topic VARCHAR(255) NOT NULL,
        title VARCHAR(500) NOT NULL,
        difficulty VARCHAR(32) NOT NULL DEFAULT 'Medium',
        question_count INT UNSIGNED NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_quizzes_user_id (user_id, id),
        CONSTRAINT fk_quizzes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_quizzes_note FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS quiz_questions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        quiz_id INT UNSIGNED NOT NULL,
        question_order INT NOT NULL,
        question_text TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_option VARCHAR(8) NOT NULL,
        explanation TEXT NOT NULL,
        quote_evidence TEXT NOT NULL,
        revision_hint TEXT NOT NULL,
        PRIMARY KEY (id),
        KEY idx_questions_quiz_order (quiz_id, question_order),
        CONSTRAINT fk_questions_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT UNSIGNED NOT NULL,
        quiz_id INT UNSIGNED NOT NULL,
        total_questions INT UNSIGNED NOT NULL,
        score INT UNSIGNED NOT NULL,
        score_percentage DECIMAL(5, 1) NOT NULL,
        time_taken_seconds INT UNSIGNED NOT NULL DEFAULT 0,
        completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_attempts_user_completed (user_id, id),
        CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_attempts_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        attempt_id INT UNSIGNED NOT NULL,
        question_id BIGINT UNSIGNED NOT NULL,
        selected_option VARCHAR(8) NOT NULL,
        is_correct TINYINT(1) NOT NULL DEFAULT 0,
        revision_hint TEXT NOT NULL,
        PRIMARY KEY (id),
        KEY idx_attempt_answers_attempt (attempt_id),
        CONSTRAINT fk_attempt_answers_attempt FOREIGN KEY (attempt_id) REFERENCES quiz_attempts (id) ON DELETE CASCADE,
        CONSTRAINT fk_attempt_answers_question FOREIGN KEY (question_id) REFERENCES quiz_questions (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS learning_progress (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT UNSIGNED NOT NULL,
        topic VARCHAR(255) NOT NULL,
        total_attempts INT UNSIGNED NOT NULL DEFAULT 0,
        avg_score DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
        mastery_level VARCHAR(64) NOT NULL DEFAULT 'Needs Practice',
        last_practiced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_user_topic (user_id, topic),
        CONSTRAINT fk_progress_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS qa_history (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT UNSIGNED NOT NULL,
        topic_filter VARCHAR(255) NULL,
        question TEXT NOT NULL,
        answer LONGTEXT NOT NULL,
        status VARCHAR(32) NOT NULL,
        is_supported TINYINT(1) NOT NULL DEFAULT 0,
        confidence DECIMAL(4, 2) NOT NULL DEFAULT 0.00,
        model_used VARCHAR(128) NOT NULL,
        evidence_json LONGTEXT NOT NULL,
        notes_consulted_json TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_qa_user_created (user_id, id),
        CONSTRAINT fk_qa_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // ---------------- Auth & Sessions ----------------

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const p = this.getPool();
    const [rows] = await p.query<RowDataPacket[]>(
      'SELECT id, full_name, email, password_hash, created_at FROM users WHERE email = ? LIMIT 1',
      [email.toLowerCase()]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      full_name: String(r.full_name),
      email: String(r.email),
      password_hash: String(r.password_hash),
      created_at: toIsoString(r.created_at),
    };
  }

  async createUser(params: {
    fullName: string;
    email: string;
    passwordHash: string;
  }): Promise<PublicUser> {
    const p = this.getPool();
    const emailLower = params.email.toLowerCase();
    const [res] = await p.query<ResultSetHeader>(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      [params.fullName, emailLower, params.passwordHash]
    );
    const userId = Number(res.insertId);
    return {
      id: userId,
      full_name: params.fullName,
      email: emailLower,
      created_at: new Date().toISOString(),
    };
  }

  async createSession(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
    const p = this.getPool();
    await p.query(
      'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt]
    );
  }

  async getUserBySessionTokenHash(tokenHash: string): Promise<PublicUser | null> {
    const p = this.getPool();
    const [rows] = await p.query<RowDataPacket[]>(
      `SELECT u.id, u.full_name, u.email, u.created_at
       FROM user_sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      full_name: String(r.full_name),
      email: String(r.email),
      created_at: toIsoString(r.created_at),
    };
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    const p = this.getPool();
    await p.query('DELETE FROM user_sessions WHERE token_hash = ?', [tokenHash]);
  }

  // ---------------- Notes & Sections ----------------

  async createNote(params: {
    userId: number;
    title: string;
    topic: string;
    fileType: string;
    originalFilename: string | null;
    content: string;
  }): Promise<NoteRecord & { sections: NoteSection[] }> {
    const p = this.getPool();
    const content = params.content.trim();
    const charCount = content.length;
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const parsedSections = processTextIntoSections(content);

    const conn = await p.getConnection();
    try {
      await conn.beginTransaction();

      const [noteRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO notes (user_id, title, topic, file_type, original_filename, content, char_count, word_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.userId,
          params.title,
          params.topic,
          params.fileType,
          params.originalFilename,
          content,
          charCount,
          wordCount,
        ]
      );
      const noteId = Number(noteRes.insertId);

      const createdSections: NoteSection[] = [];
      for (const sec of parsedSections) {
        const [secRes] = await conn.query<ResultSetHeader>(
          `INSERT INTO note_sections (note_id, user_id, section_index, title, content, start_char, end_char)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            noteId,
            params.userId,
            sec.index,
            sec.title,
            sec.content,
            sec.start_char,
            sec.end_char,
          ]
        );
        createdSections.push({
          id: Number(secRes.insertId),
          note_id: noteId,
          user_id: params.userId,
          section_index: sec.index,
          title: sec.title,
          content: sec.content,
          start_char: sec.start_char,
          end_char: sec.end_char,
        });
      }

      await conn.commit();

      return {
        id: noteId,
        user_id: params.userId,
        title: params.title,
        topic: params.topic,
        file_type: params.fileType,
        original_filename: params.originalFilename,
        content,
        char_count: charCount,
        word_count: wordCount,
        created_at: new Date().toISOString(),
        sections: createdSections,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async listNotes(userId: number): Promise<Omit<NoteRecord, 'content'>[]> {
    const p = this.getPool();
    const [rows] = await p.query<RowDataPacket[]>(
      `SELECT id, user_id, title, topic, file_type, original_filename, char_count, word_count, created_at
       FROM notes
       WHERE user_id = ?
       ORDER BY id DESC`,
      [userId]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      user_id: Number(r.user_id),
      title: String(r.title),
      topic: String(r.topic),
      file_type: String(r.file_type),
      original_filename: r.original_filename ? String(r.original_filename) : null,
      char_count: Number(r.char_count),
      word_count: Number(r.word_count),
      created_at: toIsoString(r.created_at),
    }));
  }

  async listNotesWithContent(userId: number): Promise<NoteRecord[]> {
    const p = this.getPool();
    const [rows] = await p.query<RowDataPacket[]>(
      `SELECT id, user_id, title, topic, file_type, original_filename, content, char_count, word_count, created_at
       FROM notes
       WHERE user_id = ?
       ORDER BY id DESC`,
      [userId]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      user_id: Number(r.user_id),
      title: String(r.title),
      topic: String(r.topic),
      file_type: String(r.file_type),
      original_filename: r.original_filename ? String(r.original_filename) : null,
      content: String(r.content),
      char_count: Number(r.char_count),
      word_count: Number(r.word_count),
      created_at: toIsoString(r.created_at),
    }));
  }

  async getNoteDetail(
    userId: number,
    noteId: number
  ): Promise<(NoteRecord & { sections: NoteSection[] }) | null> {
    const p = this.getPool();
    const [rows] = await p.query<RowDataPacket[]>(
      `SELECT id, user_id, title, topic, file_type, original_filename, content, char_count, word_count, created_at
       FROM notes
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [noteId, userId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];

    const [secRows] = await p.query<RowDataPacket[]>(
      `SELECT id, note_id, user_id, section_index, title, content, start_char, end_char
       FROM note_sections
       WHERE note_id = ? AND user_id = ?
       ORDER BY section_index ASC`,
      [noteId, userId]
    );

    return {
      id: Number(r.id),
      user_id: Number(r.user_id),
      title: String(r.title),
      topic: String(r.topic),
      file_type: String(r.file_type),
      original_filename: r.original_filename ? String(r.original_filename) : null,
      content: String(r.content),
      char_count: Number(r.char_count),
      word_count: Number(r.word_count),
      created_at: toIsoString(r.created_at),
      sections: secRows.map((s) => ({
        id: Number(s.id),
        note_id: Number(s.note_id),
        user_id: Number(s.user_id),
        section_index: Number(s.section_index),
        title: String(s.title),
        content: String(s.content),
        start_char: Number(s.start_char),
        end_char: Number(s.end_char),
      })),
    };
  }

  async deleteNote(userId: number, noteId: number): Promise<boolean> {
    const p = this.getPool();
    const [res] = await p.query<ResultSetHeader>(
      'DELETE FROM notes WHERE id = ? AND user_id = ?',
      [noteId, userId]
    );
    return res.affectedRows > 0;
  }

  // ---------------- Grounded Q&A History ----------------

  async saveQaHistory(params: {
    userId: number;
    topicFilter: string | null;
    question: string;
    response: QuestionAnswerResponse;
  }): Promise<QaHistoryRecord> {
    const p = this.getPool();
    const [res] = await p.query<ResultSetHeader>(
      `INSERT INTO qa_history
       (user_id, topic_filter, question, answer, status, is_supported, confidence, model_used, evidence_json, notes_consulted_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.userId,
        params.topicFilter,
        params.question,
        params.response.answer,
        params.response.status,
        params.response.is_supported ? 1 : 0,
        params.response.confidence,
        params.response.model_used,
        JSON.stringify(params.response.evidence_list || []),
        JSON.stringify(params.response.notes_consulted || []),
      ]
    );

    return {
      id: Number(res.insertId),
      user_id: params.userId,
      topic_filter: params.topicFilter,
      question: params.question,
      answer: params.response.answer,
      status: params.response.status,
      is_supported: params.response.is_supported,
      confidence: params.response.confidence,
      model_used: params.response.model_used,
      evidence_list: params.response.evidence_list || [],
      notes_consulted: params.response.notes_consulted || [],
      created_at: new Date().toISOString(),
    };
  }

  async listQaHistory(userId: number, limit = 15): Promise<QaHistoryRecord[]> {
    const p = this.getPool();
    const [rows] = await p.query<RowDataPacket[]>(
      `SELECT id, user_id, topic_filter, question, answer, status, is_supported, confidence, model_used, evidence_json, notes_consulted_json, created_at
       FROM qa_history
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT ?`,
      [userId, limit]
    );
    return rows.map((r) => {
      let evidenceList: EvidenceItem[] = [];
      let notesConsulted: string[] = [];
      try {
        evidenceList = JSON.parse(String(r.evidence_json || '[]'));
      } catch {
        evidenceList = [];
      }
      try {
        notesConsulted = JSON.parse(String(r.notes_consulted_json || '[]'));
      } catch {
        notesConsulted = [];
      }
      return {
        id: Number(r.id),
        user_id: Number(r.user_id),
        topic_filter: r.topic_filter ? String(r.topic_filter) : null,
        question: String(r.question),
        answer: String(r.answer),
        status: r.status === 'SUPPORTED' ? 'SUPPORTED' : 'INSUFFICIENT_EVIDENCE',
        is_supported: Boolean(r.is_supported),
        confidence: Number(r.confidence),
        model_used: String(r.model_used),
        evidence_list: evidenceList,
        notes_consulted: notesConsulted,
        created_at: toIsoString(r.created_at),
      };
    });
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
    const p = this.getPool();
    const conn = await p.getConnection();
    try {
      await conn.beginTransaction();

      const [quizRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO quizzes (user_id, note_id, topic, title, difficulty, question_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          params.userId,
          params.noteId,
          params.topic,
          params.title,
          params.difficulty,
          params.questions.length,
        ]
      );
      const quizId = Number(quizRes.insertId);

      const publicQuestions: Array<{
        id: number;
        question_order: number;
        question_text: string;
        options: { A: string; B: string; C: string; D: string };
      }> = [];

      for (const q of params.questions) {
        const [qRes] = await conn.query<ResultSetHeader>(
          `INSERT INTO quiz_questions
           (quiz_id, question_order, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, quote_evidence, revision_hint)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            quizId,
            q.question_order,
            q.question_text,
            q.option_a,
            q.option_b,
            q.option_c,
            q.option_d,
            q.correct_option,
            q.explanation,
            q.quote_evidence,
            q.revision_hint,
          ]
        );
        publicQuestions.push({
          id: Number(qRes.insertId),
          question_order: q.question_order,
          question_text: q.question_text,
          options: {
            A: q.option_a,
            B: q.option_b,
            C: q.option_c,
            D: q.option_d,
          },
        });
      }

      await conn.commit();

      return {
        id: quizId,
        user_id: params.userId,
        note_id: params.noteId,
        topic: params.topic,
        title: params.title,
        difficulty: params.difficulty,
        question_count: params.questions.length,
        created_at: new Date().toISOString(),
        questions: publicQuestions,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async listQuizzes(userId: number): Promise<QuizRecord[]> {
    const p = this.getPool();
    const [rows] = await p.query<RowDataPacket[]>(
      `SELECT id, user_id, note_id, topic, title, difficulty, question_count, created_at
       FROM quizzes
       WHERE user_id = ?
       ORDER BY id DESC`,
      [userId]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      user_id: Number(r.user_id),
      note_id: r.note_id ? Number(r.note_id) : null,
      topic: String(r.topic),
      title: String(r.title),
      difficulty: String(r.difficulty),
      question_count: Number(r.question_count),
      created_at: toIsoString(r.created_at),
    }));
  }

  async getQuizPublic(userId: number, quizId: number) {
    const p = this.getPool();
    const [rows] = await p.query<RowDataPacket[]>(
      `SELECT id, user_id, note_id, topic, title, difficulty, question_count, created_at
       FROM quizzes
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [quizId, userId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];

    const [qRows] = await p.query<RowDataPacket[]>(
      `SELECT id, question_order, question_text, option_a, option_b, option_c, option_d
       FROM quiz_questions
       WHERE quiz_id = ?
       ORDER BY question_order ASC`,
      [quizId]
    );

    return {
      id: Number(r.id),
      user_id: Number(r.user_id),
      note_id: r.note_id ? Number(r.note_id) : null,
      topic: String(r.topic),
      title: String(r.title),
      difficulty: String(r.difficulty),
      question_count: Number(r.question_count),
      created_at: toIsoString(r.created_at),
      questions: qRows.map((q) => ({
        id: Number(q.id),
        question_order: Number(q.question_order),
        question_text: String(q.question_text),
        options: {
          A: String(q.option_a),
          B: String(q.option_b),
          C: String(q.option_c),
          D: String(q.option_d),
        },
      })),
    };
  }

  async scoreQuizAttempt(
    userId: number,
    quizId: number,
    userAnswers: Array<{ question_id: number; selected_option: string }>,
    timeTakenSeconds = 0
  ) {
    const p = this.getPool();
    const [quizRows] = await p.query<RowDataPacket[]>(
      `SELECT id, user_id, note_id, topic, title, difficulty, question_count
       FROM quizzes
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [quizId, userId]
    );
    if (quizRows.length === 0) {
      throw new Error(`Quiz with id ${quizId} not found.`);
    }
    const quiz = quizRows[0];

    const [qRows] = await p.query<RowDataPacket[]>(
      `SELECT id, question_order, question_text, option_a, option_b, option_c, option_d,
              correct_option, explanation, quote_evidence, revision_hint
       FROM quiz_questions
       WHERE quiz_id = ?
       ORDER BY question_order ASC`,
      [quizId]
    );

    let linkedNote: { title: string; content: string } | null = null;
    if (quiz.note_id) {
      const [nRows] = await p.query<RowDataPacket[]>(
        'SELECT title, content FROM notes WHERE id = ? AND user_id = ? LIMIT 1',
        [quiz.note_id, userId]
      );
      if (nRows.length > 0) {
        linkedNote = { title: String(nRows[0].title), content: String(nRows[0].content) };
      }
    }

    const answersMap = new Map<number, string>();
    for (const a of userAnswers) {
      answersMap.set(Number(a.question_id), (a.selected_option || '').trim().toUpperCase());
    }

    let correctCount = 0;
    const totalQuestions = qRows.length;
    const results = qRows.map((q) => {
      const qId = Number(q.id);
      const userChoice = answersMap.get(qId) || '';
      const correctOption = String(q.correct_option);
      const isCorrect = userChoice === correctOption;
      if (isCorrect) correctCount += 1;

      const quoteEv = String(q.quote_evidence || '');
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
          section_title: String(quiz.topic),
          status: verRes.status,
        };
      }

      return {
        question_id: qId,
        question_text: String(q.question_text),
        selected_option: userChoice,
        correct_option: correctOption,
        is_correct: isCorrect,
        explanation: String(q.explanation || ''),
        quote_evidence: quoteEv,
        evidence_verification: verification,
        revision_hint: String(q.revision_hint || ''),
      };
    });

    const scorePct =
      totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 1000) / 10 : 0.0;

    const conn = await p.getConnection();
    let attemptId = 0;
    try {
      await conn.beginTransaction();

      const [attRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO quiz_attempts (user_id, quiz_id, total_questions, score, score_percentage, time_taken_seconds)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, quizId, totalQuestions, correctCount, scorePct, timeTakenSeconds]
      );
      attemptId = Number(attRes.insertId);

      for (const r of results) {
        await conn.query(
          `INSERT INTO quiz_attempt_answers (attempt_id, question_id, selected_option, is_correct, revision_hint)
           VALUES (?, ?, ?, ?, ?)`,
          [attemptId, r.question_id, r.selected_option, r.is_correct ? 1 : 0, r.revision_hint]
        );
      }

      const topicStr = String(quiz.topic);
      const [progRows] = await conn.query<RowDataPacket[]>(
        'SELECT total_attempts, avg_score FROM learning_progress WHERE user_id = ? AND topic = ? LIMIT 1',
        [userId, topicStr]
      );

      if (progRows.length > 0) {
        const oldAttempts = Number(progRows[0].total_attempts);
        const oldAvg = Number(progRows[0].avg_score);
        const newAttempts = oldAttempts + 1;
        const newAvg =
          Math.round(((oldAvg * oldAttempts + scorePct) / newAttempts) * 10) / 10;
        const mastery =
          newAvg >= 85 ? 'Mastered' : newAvg >= 70 ? 'Proficient' : 'Needs Practice';
        await conn.query(
          `UPDATE learning_progress
           SET total_attempts = ?, avg_score = ?, mastery_level = ?, last_practiced_at = NOW()
           WHERE user_id = ? AND topic = ?`,
          [newAttempts, newAvg, mastery, userId, topicStr]
        );
      } else {
        const mastery =
          scorePct >= 85 ? 'Mastered' : scorePct >= 70 ? 'Proficient' : 'Needs Practice';
        await conn.query(
          `INSERT INTO learning_progress (user_id, topic, total_attempts, avg_score, mastery_level)
           VALUES (?, ?, 1, ?, ?)`,
          [userId, topicStr, scorePct, mastery]
        );
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
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
      attempt_id: attemptId,
      quiz_id: quizId,
      score: correctCount,
      total_questions: totalQuestions,
      score_percentage: scorePct,
      time_taken_seconds: timeTakenSeconds,
      results,
      summary_feedback: summaryFeedback,
    };
  }

  async getAttemptDetail(userId: number, attemptId: number) {
    const p = this.getPool();
    const [attRows] = await p.query<RowDataPacket[]>(
      `SELECT id, user_id, quiz_id, total_questions, score, score_percentage, time_taken_seconds, completed_at
       FROM quiz_attempts
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [attemptId, userId]
    );
    if (attRows.length === 0) return null;
    const att = attRows[0];

    const [ansRows] = await p.query<RowDataPacket[]>(
      `SELECT a.question_id, a.selected_option, a.is_correct, a.revision_hint,
              q.question_order, q.question_text, q.correct_option, q.explanation, q.quote_evidence
       FROM quiz_attempt_answers a
       INNER JOIN quiz_questions q ON q.id = a.question_id
       WHERE a.attempt_id = ?
       ORDER BY q.question_order ASC`,
      [attemptId]
    );

    const results = ansRows.map((r) => ({
      question_id: Number(r.question_id),
      question_text: String(r.question_text),
      selected_option: String(r.selected_option),
      correct_option: String(r.correct_option),
      is_correct: Boolean(r.is_correct),
      explanation: String(r.explanation),
      quote_evidence: String(r.quote_evidence),
      evidence_verification: null,
      revision_hint: String(r.revision_hint),
    }));

    const completedIso = toIsoString(att.completed_at);
    return {
      attempt_id: Number(att.id),
      quiz_id: Number(att.quiz_id),
      score: Number(att.score),
      total_questions: Number(att.total_questions),
      score_percentage: Number(att.score_percentage),
      time_taken_seconds: Number(att.time_taken_seconds),
      results,
      summary_feedback: `Reviewing attempt from ${new Date(completedIso).toLocaleString()}.`,
    };
  }

  async getDashboardAnalytics(userId: number) {
    const p = this.getPool();

    const [[noteCountRow]] = await p.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS cnt FROM notes WHERE user_id = ?',
      [userId]
    );
    const totalNotes = Number(noteCountRow?.cnt || 0);

    const [[attAggRow]] = await p.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(score), 0) AS total_correct, COALESCE(SUM(total_questions), 0) AS total_qs
       FROM quiz_attempts
       WHERE user_id = ?`,
      [userId]
    );
    const totalAttempts = Number(attAggRow?.cnt || 0);
    const totalCorrect = Number(attAggRow?.total_correct || 0);
    const totalQs = Number(attAggRow?.total_qs || 0);
    const overallAccuracy =
      totalQs > 0 ? Math.round((totalCorrect / totalQs) * 1000) / 10 : 0.0;

    const [progRows] = await p.query<RowDataPacket[]>(
      `SELECT topic, total_attempts, avg_score, mastery_level, last_practiced_at
       FROM learning_progress
       WHERE user_id = ?
       ORDER BY avg_score DESC`,
      [userId]
    );

    const progressList: LearningProgressRecord[] = progRows.map((r) => ({
      user_id: userId,
      topic: String(r.topic),
      total_attempts: Number(r.total_attempts),
      avg_score: Number(r.avg_score),
      mastery_level: String(r.mastery_level),
      last_practiced_at: toIsoString(r.last_practiced_at),
    }));

    const topicMastery = progressList.map((pr) => {
      let rec: string;
      if (pr.avg_score >= 85) {
        rec = 'Topic mastered! Challenge yourself with advanced follow-up assessments.';
      } else if (pr.avg_score >= 70) {
        rec = 'Solid comprehension. Review targeted quote passages to achieve top mastery.';
      } else {
        rec = 'Priority review area: review evidence inspector quotes and re-take practice quiz.';
      }
      return {
        topic: pr.topic,
        attempts: pr.total_attempts,
        avg_score: pr.avg_score,
        mastery_level: pr.mastery_level,
        recommendation: rec,
      };
    });

    const adaptiveRecs: string[] = [];
    const weakTopics = progressList
      .filter((pr) => pr.avg_score < 75)
      .sort((a, b) => a.avg_score - b.avg_score);

    for (const w of weakTopics) {
      adaptiveRecs.push(
        `Focus revision on '${w.topic}': your average accuracy is ${w.avg_score}%. Review key concept definitions and take a targeted quiz.`
      );
    }

    const [wrongRows] = await p.query<RowDataPacket[]>(
      `SELECT a.revision_hint, qz.topic
       FROM quiz_attempt_answers a
       INNER JOIN quiz_attempts att ON att.id = a.attempt_id
       INNER JOIN quizzes qz ON qz.id = att.quiz_id
       WHERE att.user_id = ? AND a.is_correct = 0 AND a.revision_hint <> ''
       ORDER BY a.id DESC
       LIMIT 3`,
      [userId]
    );

    for (const rw of wrongRows) {
      const msg = `Targeted Hint (${String(rw.topic)}): ${String(rw.revision_hint)}`;
      if (!adaptiveRecs.includes(msg)) {
        adaptiveRecs.push(msg);
      }
    }

    if (adaptiveRecs.length === 0) {
      if (totalNotes === 0) {
        adaptiveRecs.push(
          'Welcome to your workspace! Upload a PDF/TXT study note or load sample notes to begin.'
        );
      } else if (totalAttempts === 0) {
        adaptiveRecs.push(
          'Ready to begin: Select a note and take your first AI-generated quiz to establish a baseline.'
        );
        adaptiveRecs.push(
          'Use the Grounded Q&A tab to ask complex questions and inspect verified quotations.'
        );
      } else {
        adaptiveRecs.push(
          'Great progress across all topics! Continue taking challenging quizzes to maintain long-term retention.'
        );
      }
    }

    const [recentRows] = await p.query<RowDataPacket[]>(
      `SELECT att.id AS attempt_id, att.quiz_id, qz.title AS quiz_title, qz.topic,
              att.score, att.total_questions, att.score_percentage, att.completed_at
       FROM quiz_attempts att
       LEFT JOIN quizzes qz ON qz.id = att.quiz_id
       WHERE att.user_id = ?
       ORDER BY att.id DESC
       LIMIT 10`,
      [userId]
    );

    const recentAttempts = recentRows.map((r) => ({
      attempt_id: Number(r.attempt_id),
      quiz_id: Number(r.quiz_id),
      quiz_title: r.quiz_title ? String(r.quiz_title) : `Quiz #${r.quiz_id}`,
      topic: r.topic ? String(r.topic) : 'General',
      score: Number(r.score),
      total_questions: Number(r.total_questions),
      score_percentage: Number(r.score_percentage),
      completed_at: toIsoString(r.completed_at),
    }));

    return {
      total_notes: totalNotes,
      total_quizzes_taken: totalAttempts,
      overall_accuracy: overallAccuracy,
      topic_mastery: topicMastery,
      adaptive_recommendations: adaptiveRecs,
      recent_attempts: recentAttempts,
    };
  }
}
