import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type {
  LearningProgressRecord,
  NoteRecord,
  NoteSection,
  PublicUser,
  QaHistoryRecord,
  QuestionAnswerResponse,
  QuizAttemptAnswerRecord,
  QuizAttemptRecord,
  QuizQuestionRecord,
  QuizRecord,
  UserRecord,
  UserSessionRecord,
} from './types.ts';
import { processTextIntoSections, verifyQuoteInText } from './documentService.ts';
import { MySQLBackend } from './mysqlBackend.ts';
import { PostgresBackend } from './postgresBackend.ts';

export interface IDatabaseBackend {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  createUser(params: { fullName: string; email: string; passwordHash: string; uid?: string }): Promise<PublicUser>;
  updateUserProfile(userId: number, profile: {
    fullName?: string;
    course: string;
    stream: string;
    college: string;
    university: string;
  }): Promise<PublicUser>;
  createSession(userId: number, tokenHash: string, expiresAt: Date): Promise<void>;
  getUserBySessionTokenHash(tokenHash: string): Promise<PublicUser | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
  createNote(params: {
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
  }): Promise<NoteRecord & { sections: NoteSection[] }>;
  listNotes(userId: number): Promise<Omit<NoteRecord, 'content'>[]>;
  listNotesWithContent(userId: number): Promise<NoteRecord[]>;
  getNoteDetail(userId: number, noteId: number): Promise<(NoteRecord & { sections: NoteSection[] }) | null>;
  deleteNote(userId: number, noteId: number): Promise<boolean>;
  listCentralLibrary(
    currentUserId: number,
    filter?: string,
    search?: string
  ): Promise<Array<NoteRecord & { relevance_badge: string; relevance_score: number }>>;
  cloneNoteToUser(targetUserId: number, sourceNoteId: number): Promise<NoteRecord>;
  checkDuplicateNote?(contentHash: string): Promise<NoteRecord | null>;
  saveQaHistory(params: {
    userId: number;
    topicFilter: string | null;
    question: string;
    response: QuestionAnswerResponse;
  }): Promise<QaHistoryRecord>;
  listQaHistory(userId: number, limit?: number): Promise<QaHistoryRecord[]>;
  createQuiz(params: {
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
  }): Promise<any>;
  listQuizzes(userId: number): Promise<QuizRecord[]>;
  getQuizPublic(userId: number, quizId: number): Promise<any>;
  scoreQuizAttempt(
    userId: number,
    quizId: number,
    userAnswers: Array<{ question_id: number; selected_option: string }>,
    timeTakenSeconds?: number
  ): Promise<any>;
  getAttemptDetail(userId: number, attemptId: number): Promise<any>;
  getDashboardAnalytics(userId: number): Promise<any>;
}

interface PersistedState {
  users: UserRecord[];
  sessions: UserSessionRecord[];
  notes: NoteRecord[];
  noteSections: NoteSection[];
  quizzes: QuizRecord[];
  quizQuestions: QuizQuestionRecord[];
  quizAttempts: QuizAttemptRecord[];
  quizAttemptAnswers: QuizAttemptAnswerRecord[];
  learningProgress: LearningProgressRecord[];
  qaHistory: QaHistoryRecord[];
  counters: {
    user: number;
    session: number;
    note: number;
    section: number;
    quiz: number;
    question: number;
    attempt: number;
    attemptAnswer: number;
    qa: number;
  };
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

class StudyStore {
  private backend: IDatabaseBackend | null = null;
  private backendName = 'Persistent Local Store';
  private diskPath = path.resolve(process.cwd(), '.data', 'notebound_store.json');

  private data: PersistedState = {
    users: [],
    sessions: [],
    notes: [],
    noteSections: [],
    quizzes: [],
    quizQuestions: [],
    quizAttempts: [],
    quizAttemptAnswers: [],
    learningProgress: [],
    qaHistory: [],
    counters: {
      user: 1,
      session: 1,
      note: 1,
      section: 1,
      quiz: 1,
      question: 1,
      attempt: 1,
      attemptAnswer: 1,
      qa: 1,
    },
  };

  async init(): Promise<void> {
    // 1. Check Cloud SQL PostgreSQL (Unix Socket)
    if (process.env.SQL_HOST) {
      try {
        const pg = new PostgresBackend();
        await pg.init();
        this.backend = pg;
        this.backendName = 'Cloud SQL (PostgreSQL)';
        console.log(`[DB] Connected to Cloud SQL PostgreSQL (${process.env.SQL_DB_NAME || 'default'}) via Unix Domain Socket.`);
        return;
      } catch (err) {
        console.warn('[DB] Cloud SQL PostgreSQL initialization failed:', err);
      }
    }

    // 2. Check local MySQL if configured
    const mysqlHost = (process.env.MYSQL_HOST || '').trim();
    if (mysqlHost) {
      try {
        const my = new MySQLBackend();
        await my.init();
        this.backend = my;
        this.backendName = 'MySQL Database';
        console.log(
          `[DB] Connected to MySQL (${mysqlHost}:${process.env.MYSQL_PORT || 3306}/${process.env.MYSQL_DATABASE || 'notebound_ai'})`
        );
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (String(process.env.MYSQL_STRICT || '').toLowerCase() === 'true') {
          throw new Error(`MySQL connection failed: ${msg}`);
        }
        console.warn(
          `[DB] MySQL at ${mysqlHost} was unreachable (${msg}). Falling back to persistent disk store (.data/notebound_store.json) until MySQL is reachable.`
        );
      }
    }

    this.loadFromDisk();
  }

  getEngineName(): string {
    return this.backendName;
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.diskPath)) {
        const raw = fs.readFileSync(this.diskPath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        this.data = {
          users: parsed.users || [],
          sessions: parsed.sessions || [],
          notes: parsed.notes || [],
          noteSections: parsed.noteSections || [],
          quizzes: parsed.quizzes || [],
          quizQuestions: parsed.quizQuestions || [],
          quizAttempts: parsed.quizAttempts || [],
          quizAttemptAnswers: parsed.quizAttemptAnswers || [],
          learningProgress: parsed.learningProgress || [],
          qaHistory: parsed.qaHistory || [],
          counters: {
            user: parsed.counters?.user || 1,
            session: parsed.counters?.session || 1,
            note: parsed.counters?.note || 1,
            section: parsed.counters?.section || 1,
            quiz: parsed.counters?.quiz || 1,
            question: parsed.counters?.question || 1,
            attempt: parsed.counters?.attempt || 1,
            attemptAnswer: parsed.counters?.attemptAnswer || 1,
            qa: parsed.counters?.qa || 1,
          },
        };
      }
    } catch (err) {
      console.warn('[DB] Could not load persisted store from disk, starting fresh:', err);
    }
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.diskPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.diskPath, JSON.stringify(this.data), 'utf-8');
    } catch (err) {
      console.error('[DB] Failed to persist store to disk:', err);
    }
  }

  // ---------------- Authentication & Sessions ----------------

  async registerUser(params: {
    fullName: string;
    email: string;
    password: string;
  }): Promise<{ user: PublicUser; token: string; expiresAt: Date }> {
    const fullName = params.fullName.trim();
    const email = params.email.trim().toLowerCase();

    if (fullName.length < 2) {
      throw new Error('Full name must be at least 2 characters.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Please enter a valid email address.');
    }
    if (params.password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const existing = this.backend
      ? await this.backend.findUserByEmail(email)
      : this.data.users.find((u) => u.email === email) || null;

    if (existing) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }

    const passwordHash = await bcrypt.hash(params.password, 10);

    let publicUser: PublicUser;
    if (this.backend) {
      publicUser = await this.backend.createUser({ fullName, email, passwordHash });
    } else {
      const id = this.data.counters.user++;
      const createdAt = new Date().toISOString();
      const userRec: UserRecord = {
        id,
        full_name: fullName,
        email,
        password_hash: passwordHash,
        course: '',
        stream: '',
        college: '',
        university: '',
        is_profile_completed: false,
        created_at: createdAt,
      };
      this.data.users.push(userRec);
      publicUser = {
        id,
        full_name: fullName,
        email,
        course: '',
        stream: '',
        college: '',
        university: '',
        is_profile_completed: false,
        created_at: createdAt,
      };
      this.saveToDisk();
    }

    const session = await this.issueSession(publicUser.id);
    return { user: publicUser, ...session };
  }

  async loginUser(params: {
    email: string;
    password: string;
  }): Promise<{ user: PublicUser; token: string; expiresAt: Date }> {
    const email = params.email.trim().toLowerCase();
    const userRec = this.backend
      ? await this.backend.findUserByEmail(email)
      : this.data.users.find((u) => u.email === email) || null;

    if (!userRec) {
      throw new Error('Invalid email or password.');
    }

    const valid = await bcrypt.compare(params.password, userRec.password_hash);
    if (!valid) {
      throw new Error('Invalid email or password.');
    }

    const publicUser: PublicUser = {
      id: userRec.id,
      full_name: userRec.full_name,
      email: userRec.email,
      course: userRec.course || '',
      stream: userRec.stream || '',
      college: userRec.college || '',
      university: userRec.university || '',
      is_profile_completed: Boolean(userRec.is_profile_completed),
      created_at: userRec.created_at,
    };

    const session = await this.issueSession(publicUser.id);
    return { user: publicUser, ...session };
  }

  async findOrCreateFirebaseUser(
    uid: string,
    email: string,
    fullName?: string
  ): Promise<{ user: PublicUser; token: string; expiresAt: Date }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName && fullName.trim() ? fullName.trim() : cleanEmail.split('@')[0];

    const userRec = this.backend
      ? await this.backend.findUserByEmail(cleanEmail)
      : this.data.users.find((u) => u.email === cleanEmail) || null;

    let publicUser: PublicUser;
    if (!userRec) {
      if (this.backend) {
        publicUser = await this.backend.createUser({
          fullName: cleanName,
          email: cleanEmail,
          passwordHash: '',
          uid,
        });
      } else {
        const id = this.data.counters.user++;
        const createdAt = new Date().toISOString();
        const newU: UserRecord = {
          id,
          full_name: cleanName,
          email: cleanEmail,
          password_hash: '',
          course: '',
          stream: '',
          college: '',
          university: '',
          is_profile_completed: false,
          created_at: createdAt,
        };
        this.data.users.push(newU);
        publicUser = {
          id,
          full_name: cleanName,
          email: cleanEmail,
          course: '',
          stream: '',
          college: '',
          university: '',
          is_profile_completed: false,
          created_at: createdAt,
        };
        this.saveToDisk();
      }
    } else {
      publicUser = {
        id: userRec.id,
        full_name: userRec.full_name,
        email: userRec.email,
        course: userRec.course || '',
        stream: userRec.stream || '',
        college: userRec.college || '',
        university: userRec.university || '',
        is_profile_completed: Boolean(userRec.is_profile_completed),
        created_at: userRec.created_at,
      };
    }

    const session = await this.issueSession(publicUser.id);
    return { user: publicUser, ...session };
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
    if (this.backend) {
      return this.backend.updateUserProfile(userId, profile);
    }

    const u = this.data.users.find((usr) => usr.id === userId);
    if (!u) {
      throw new Error(`User ${userId} not found.`);
    }

    if (profile.fullName && profile.fullName.trim()) {
      u.full_name = profile.fullName.trim();
    }
    u.course = profile.course.trim();
    u.stream = profile.stream.trim();
    u.college = profile.college.trim();
    u.university = profile.university.trim();
    u.is_profile_completed = true;

    for (const note of this.data.notes) {
      if (note.user_id === userId) {
        note.author_name = u.full_name;
        note.author_college = u.college;
        note.author_university = u.university;
        note.author_course = u.course;
        note.author_stream = u.stream;
      }
    }

    this.saveToDisk();

    return {
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      course: u.course,
      stream: u.stream,
      college: u.college,
      university: u.university,
      is_profile_completed: true,
      created_at: u.created_at,
    };
  }

  private async issueSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    if (this.backend) {
      await this.backend.createSession(userId, tokenHash, expiresAt);
    } else {
      this.data.sessions.push({
        id: this.data.counters.session++,
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      });
      this.saveToDisk();
    }

    return { token: rawToken, expiresAt };
  }

  async authenticateToken(rawToken: string): Promise<PublicUser | null> {
    if (!rawToken) return null;
    const tokenHash = hashToken(rawToken);

    if (this.backend) {
      return this.backend.getUserBySessionTokenHash(tokenHash);
    }

    const nowMs = Date.now();
    const sess = this.data.sessions.find(
      (s) => s.token_hash === tokenHash && new Date(s.expires_at).getTime() > nowMs
    );
    if (!sess) return null;
    const u = this.data.users.find((usr) => usr.id === sess.user_id);
    if (!u) return null;
    return {
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      course: u.course || '',
      stream: u.stream || '',
      college: u.college || '',
      university: u.university || '',
      is_profile_completed: Boolean(u.is_profile_completed),
      created_at: u.created_at,
    };
  }

  async revokeSession(rawToken: string): Promise<void> {
    if (!rawToken) return;
    const tokenHash = hashToken(rawToken);

    if (this.backend) {
      await this.backend.deleteSessionByTokenHash(tokenHash);
      return;
    }

    this.data.sessions = this.data.sessions.filter((s) => s.token_hash !== tokenHash);
    this.saveToDisk();
  }

  // ---------------- Per-User Notes ----------------

  async seedSampleNotes(userId: number): Promise<number> {
    const sampleDir = path.resolve(process.cwd(), 'sample_notes');
    if (!fs.existsSync(sampleDir)) {
      return 0;
    }

    const existingNotes = await this.listNotes(userId);
    const samples = [
      {
        filename: 'distributed_systems_raft.txt',
        title: 'Distributed Systems: The Raft Consensus Algorithm',
        topic: 'Computer Science: Distributed Systems',
      },
      {
        filename: 'cellular_respiration_biology.txt',
        title: 'Cellular Respiration and Energy Production',
        topic: 'Biology: Molecular & Cellular Biology',
      },
    ];

    let added = 0;
    for (const s of samples) {
      if (existingNotes.some((n) => n.title === s.title)) {
        continue;
      }
      const filePath = path.join(sampleDir, s.filename);
      if (fs.existsSync(filePath)) {
        const text = fs.readFileSync(filePath, 'utf-8').trim();
        await this.createNote({
          userId,
          title: s.title,
          topic: s.topic,
          fileType: 'txt',
          originalFilename: s.filename,
          content: text,
        });
        added += 1;
      }
    }
    return added;
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
  }): Promise<NoteRecord & { sections: NoteSection[] }> {
    if (this.backend) {
      return this.backend.createNote(params);
    }

    const content = params.content.trim();
    const charCount = content.length;
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const createdAt = new Date().toISOString();
    const noteId = this.data.counters.note++;

    const note: NoteRecord = {
      id: noteId,
      user_id: params.userId,
      title: params.title,
      topic: params.topic,
      file_type: params.fileType,
      original_filename: params.originalFilename,
      content,
      char_count: charCount,
      word_count: wordCount,
      author_name: params.authorName || '',
      author_college: params.authorCollege || '',
      author_university: params.authorUniversity || '',
      author_course: params.authorCourse || '',
      author_stream: params.authorStream || '',
      is_duplicate: false,
      canonical_note_id: null,
      storage_saved: false,
      created_at: createdAt,
    };
    this.data.notes.push(note);

    const parsedSections = processTextIntoSections(content);
    const createdSections: NoteSection[] = parsedSections.map((sec) => {
      const section: NoteSection = {
        id: this.data.counters.section++,
        note_id: noteId,
        user_id: params.userId,
        section_index: sec.index,
        title: sec.title,
        content: sec.content,
        start_char: sec.start_char,
        end_char: sec.end_char,
      };
      this.data.noteSections.push(section);
      return section;
    });

    this.saveToDisk();

    return {
      ...note,
      sections: createdSections,
    };
  }

  async listNotes(userId: number): Promise<Omit<NoteRecord, 'content'>[]> {
    if (this.backend) {
      return this.backend.listNotes(userId);
    }
    return this.data.notes
      .filter((n) => n.user_id === userId)
      .sort((a, b) => b.id - a.id)
      .map(({ content: _content, ...rest }) => rest);
  }

  async listNotesWithContent(userId: number): Promise<NoteRecord[]> {
    if (this.backend) {
      return this.backend.listNotesWithContent(userId);
    }
    return this.data.notes
      .filter((n) => n.user_id === userId)
      .sort((a, b) => b.id - a.id);
  }

  async getNoteDetail(
    userId: number,
    noteId: number
  ): Promise<(NoteRecord & { sections: NoteSection[] }) | null> {
    if (this.backend) {
      return this.backend.getNoteDetail(userId, noteId);
    }
    const note = this.data.notes.find((n) => n.id === noteId && n.user_id === userId);
    if (!note) return null;
    const sections = this.data.noteSections
      .filter((s) => s.note_id === noteId && s.user_id === userId)
      .sort((a, b) => a.section_index - b.section_index);
    return { ...note, sections };
  }

  async deleteNote(userId: number, noteId: number): Promise<boolean> {
    if (this.backend) {
      return this.backend.deleteNote(userId, noteId);
    }
    const idx = this.data.notes.findIndex((n) => n.id === noteId && n.user_id === userId);
    if (idx === -1) return false;
    this.data.notes.splice(idx, 1);
    this.data.noteSections = this.data.noteSections.filter(
      (s) => !(s.note_id === noteId && s.user_id === userId)
    );
    for (const q of this.data.quizzes) {
      if (q.user_id === userId && q.note_id === noteId) {
        q.note_id = null;
      }
    }
    this.saveToDisk();
    return true;
  }

  async listCentralLibrary(
    currentUserId: number,
    filter = 'all',
    search = ''
  ): Promise<Array<NoteRecord & { relevance_badge: string; relevance_score: number }>> {
    if (this.backend) {
      return this.backend.listCentralLibrary(currentUserId, filter, search);
    }

    const currentUser = this.data.users.find((u) => u.id === currentUserId);
    const userCollege = (currentUser?.college || '').trim().toLowerCase();
    const userUniversity = (currentUser?.university || '').trim().toLowerCase();
    const userCourse = (currentUser?.course || '').trim().toLowerCase();
    const userStream = (currentUser?.stream || '').trim().toLowerCase();
    const searchLower = (search || '').trim().toLowerCase();

    const otherNotes = this.data.notes.filter(
      (n) => n.user_id !== currentUserId && !n.is_duplicate
    );

    const scored = otherNotes
      .map((n) => {
        const author = this.data.users.find((u) => u.id === n.user_id);
        const aCollege = (n.author_college || author?.college || '').trim().toLowerCase();
        const aUniv = (n.author_university || author?.university || '').trim().toLowerCase();
        const aCourse = (n.author_course || author?.course || '').trim().toLowerCase();
        const aStream = (n.author_stream || author?.stream || '').trim().toLowerCase();

        if (searchLower) {
          const matchTitle = n.title.toLowerCase().includes(searchLower);
          const matchTopic = n.topic.toLowerCase().includes(searchLower);
          const matchContent = n.content.slice(0, 1000).toLowerCase().includes(searchLower);
          if (!matchTitle && !matchTopic && !matchContent) return null;
        }

        let score = 10;
        let badge = 'General Academic';

        const sameCollege = userCollege && aCollege && userCollege === aCollege;
        const sameUniv = userUniversity && aUniv && userUniversity === aUniv;
        const sameCourse = userCourse && aCourse && userCourse === aCourse;
        const sameStream = userStream && aStream && userStream === aStream;

        if (sameCollege && sameCourse) {
          score += 60;
          badge = `🎓 Same College & Course (${n.author_college || author?.college})`;
        } else if (sameCollege) {
          score += 45;
          badge = `🏛️ Same College (${n.author_college || author?.college})`;
        } else if (sameUniv && sameCourse) {
          score += 40;
          badge = `📚 Same University & Course (${n.author_university || author?.university})`;
        } else if (sameUniv) {
          score += 30;
          badge = `🏫 Same University (${n.author_university || author?.university})`;
        } else if (sameCourse) {
          score += 25;
          badge = `📖 Same Course (${n.author_course || author?.course})`;
        } else if (sameStream) {
          score += 20;
          badge = `🔬 Same Stream (${n.author_stream || author?.stream})`;
        }

        if (filter === 'college' && !sameCollege) return null;
        if (filter === 'university' && !sameUniv) return null;
        if (filter === 'course' && !sameCourse) return null;
        if (filter === 'stream' && !sameStream) return null;

        return {
          ...n,
          author_name: n.author_name || author?.full_name || 'Peer Student',
          author_college: n.author_college || author?.college || '',
          author_university: n.author_university || author?.university || '',
          author_course: n.author_course || author?.course || '',
          author_stream: n.author_stream || author?.stream || '',
          relevance_badge: badge,
          relevance_score: score,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.relevance_score - a.relevance_score || b.id - a.id);

    return scored;
  }

  async cloneNoteToUser(targetUserId: number, sourceNoteId: number): Promise<NoteRecord> {
    if (this.backend) {
      return this.backend.cloneNoteToUser(targetUserId, sourceNoteId);
    }

    const src = this.data.notes.find((n) => n.id === sourceNoteId);
    if (!src) throw new Error(`Note ${sourceNoteId} not found.`);

    const existing = this.data.notes.find(
      (n) => n.user_id === targetUserId && (n.canonical_note_id === src.id || n.id === src.id)
    );
    if (existing) return existing;

    const newId = this.data.counters.note++;
    const cloned: NoteRecord = {
      ...src,
      id: newId,
      user_id: targetUserId,
      is_duplicate: true,
      canonical_note_id: src.id,
      storage_saved: true,
      created_at: new Date().toISOString(),
    };
    this.data.notes.push(cloned);
    this.saveToDisk();
    return cloned;
  }

  // ---------------- Grounded Q&A History ----------------

  async saveQaHistory(params: {
    userId: number;
    topicFilter: string | null;
    question: string;
    response: QuestionAnswerResponse;
  }): Promise<QaHistoryRecord> {
    if (this.backend) {
      return this.backend.saveQaHistory(params);
    }
    const rec: QaHistoryRecord = {
      id: this.data.counters.qa++,
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
    this.data.qaHistory.push(rec);
    this.saveToDisk();
    return rec;
  }

  async listQaHistory(userId: number, limit = 15): Promise<QaHistoryRecord[]> {
    if (this.backend) {
      return this.backend.listQaHistory(userId, limit);
    }
    return this.data.qaHistory
      .filter((h) => h.user_id === userId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  }

  // ---------------- Per-User Quizzes & Scoring ----------------

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
    if (this.backend) {
      return this.backend.createQuiz(params);
    }

    const quizId = this.data.counters.quiz++;
    const createdAt = new Date().toISOString();
    const quiz: QuizRecord = {
      id: quizId,
      user_id: params.userId,
      note_id: params.noteId,
      topic: params.topic,
      title: params.title,
      difficulty: params.difficulty,
      question_count: params.questions.length,
      created_at: createdAt,
    };
    this.data.quizzes.push(quiz);

    const publicQuestions = params.questions.map((q) => {
      const qRec: QuizQuestionRecord = {
        id: this.data.counters.question++,
        quiz_id: quizId,
        question_order: q.question_order,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_option: q.correct_option,
        explanation: q.explanation,
        quote_evidence: q.quote_evidence,
        revision_hint: q.revision_hint,
      };
      this.data.quizQuestions.push(qRec);
      return {
        id: qRec.id,
        question_order: qRec.question_order,
        question_text: qRec.question_text,
        options: {
          A: qRec.option_a,
          B: qRec.option_b,
          C: qRec.option_c,
          D: qRec.option_d,
        },
      };
    });

    this.saveToDisk();

    return {
      ...quiz,
      questions: publicQuestions,
    };
  }

  async listQuizzes(userId: number): Promise<QuizRecord[]> {
    if (this.backend) {
      return this.backend.listQuizzes(userId);
    }
    return this.data.quizzes
      .filter((q) => q.user_id === userId)
      .sort((a, b) => b.id - a.id);
  }

  async getQuizPublic(userId: number, quizId: number) {
    if (this.backend) {
      return this.backend.getQuizPublic(userId, quizId);
    }
    const quiz = this.data.quizzes.find((q) => q.id === quizId && q.user_id === userId);
    if (!quiz) return null;
    const qs = this.data.quizQuestions
      .filter((q) => q.quiz_id === quizId)
      .sort((a, b) => a.question_order - b.question_order)
      .map((q) => ({
        id: q.id,
        question_order: q.question_order,
        question_text: q.question_text,
        options: {
          A: q.option_a,
          B: q.option_b,
          C: q.option_c,
          D: q.option_d,
        },
      }));
    return { ...quiz, questions: qs };
  }

  async scoreQuizAttempt(
    userId: number,
    quizId: number,
    userAnswers: Array<{ question_id: number; selected_option: string }>,
    timeTakenSeconds = 0
  ) {
    if (this.backend) {
      return this.backend.scoreQuizAttempt(userId, quizId, userAnswers, timeTakenSeconds);
    }

    const quiz = this.data.quizzes.find((q) => q.id === quizId && q.user_id === userId);
    if (!quiz) {
      throw new Error(`Quiz with id ${quizId} not found.`);
    }

    const dbQuestions = this.data.quizQuestions
      .filter((q) => q.quiz_id === quizId)
      .sort((a, b) => a.question_order - b.question_order);

    const linkedNote = quiz.note_id
      ? this.data.notes.find((n) => n.id === quiz.note_id && n.user_id === userId)
      : undefined;

    const answersMap = new Map<number, string>();
    for (const a of userAnswers) {
      answersMap.set(Number(a.question_id), (a.selected_option || '').trim().toUpperCase());
    }

    let correctCount = 0;
    const totalQuestions = dbQuestions.length;
    const results = dbQuestions.map((q) => {
      const userChoice = answersMap.get(q.id) || '';
      const isCorrect = userChoice === q.correct_option;
      if (isCorrect) correctCount += 1;

      let verification = null;
      if (q.quote_evidence && linkedNote) {
        const verRes = verifyQuoteInText(q.quote_evidence, linkedNote.content);
        verification = {
          quote: q.quote_evidence,
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
        question_id: q.id,
        question_text: q.question_text,
        selected_option: userChoice,
        correct_option: q.correct_option,
        is_correct: isCorrect,
        explanation: q.explanation,
        quote_evidence: q.quote_evidence,
        evidence_verification: verification,
        revision_hint: q.revision_hint,
      };
    });

    const scorePct =
      totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 1000) / 10 : 0.0;

    const attemptId = this.data.counters.attempt++;
    const attempt: QuizAttemptRecord = {
      id: attemptId,
      user_id: userId,
      quiz_id: quizId,
      total_questions: totalQuestions,
      score: correctCount,
      score_percentage: scorePct,
      time_taken_seconds: timeTakenSeconds,
      completed_at: new Date().toISOString(),
    };
    this.data.quizAttempts.push(attempt);

    for (const r of results) {
      const ansRec: QuizAttemptAnswerRecord = {
        id: this.data.counters.attemptAnswer++,
        attempt_id: attemptId,
        question_id: r.question_id,
        selected_option: r.selected_option,
        is_correct: r.is_correct,
        revision_hint: r.revision_hint,
      };
      this.data.quizAttemptAnswers.push(ansRec);
    }

    const existingProg = this.data.learningProgress.find(
      (p) => p.user_id === userId && p.topic === quiz.topic
    );
    if (existingProg) {
      const newAttempts = existingProg.total_attempts + 1;
      const newAvg =
        Math.round(
          ((existingProg.avg_score * existingProg.total_attempts + scorePct) / newAttempts) * 10
        ) / 10;
      existingProg.total_attempts = newAttempts;
      existingProg.avg_score = newAvg;
      existingProg.mastery_level =
        newAvg >= 85 ? 'Mastered' : newAvg >= 70 ? 'Proficient' : 'Needs Practice';
      existingProg.last_practiced_at = new Date().toISOString();
    } else {
      const mastery =
        scorePct >= 85 ? 'Mastered' : scorePct >= 70 ? 'Proficient' : 'Needs Practice';
      this.data.learningProgress.push({
        user_id: userId,
        topic: quiz.topic,
        total_attempts: 1,
        avg_score: scorePct,
        mastery_level: mastery,
        last_practiced_at: new Date().toISOString(),
      });
    }

    this.saveToDisk();

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
    if (this.backend) {
      return this.backend.getAttemptDetail(userId, attemptId);
    }

    const att = this.data.quizAttempts.find(
      (a) => a.id === attemptId && a.user_id === userId
    );
    if (!att) return null;

    const answers = this.data.quizAttemptAnswers.filter((a) => a.attempt_id === attemptId);
    const results = answers
      .map((a) => {
        const q = this.data.quizQuestions.find((qq) => qq.id === a.question_id);
        if (!q) return null;
        return {
          order: q.question_order,
          item: {
            question_id: a.question_id,
            question_text: q.question_text,
            selected_option: a.selected_option,
            correct_option: q.correct_option,
            is_correct: a.is_correct,
            explanation: q.explanation,
            quote_evidence: q.quote_evidence,
            evidence_verification: null,
            revision_hint: a.revision_hint,
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.order - b.order)
      .map((x) => x.item);

    return {
      attempt_id: att.id,
      quiz_id: att.quiz_id,
      score: att.score,
      total_questions: att.total_questions,
      score_percentage: att.score_percentage,
      time_taken_seconds: att.time_taken_seconds,
      results,
      summary_feedback: `Reviewing attempt from ${new Date(att.completed_at).toLocaleString()}.`,
    };
  }

  async getDashboardAnalytics(userId: number) {
    if (this.backend) {
      return this.backend.getDashboardAnalytics(userId);
    }

    const userNotes = this.data.notes.filter((n) => n.user_id === userId);
    const userAttempts = this.data.quizAttempts.filter((a) => a.user_id === userId);
    const userAttemptIds = new Set(userAttempts.map((a) => a.id));

    const totalNotes = userNotes.length;
    const totalAttempts = userAttempts.length;
    const totalCorrect = userAttempts.reduce((acc, a) => acc + a.score, 0);
    const totalQs = userAttempts.reduce((acc, a) => acc + a.total_questions, 0);
    const overallAccuracy =
      totalQs > 0 ? Math.round((totalCorrect / totalQs) * 1000) / 10 : 0.0;

    const progressRows = this.data.learningProgress
      .filter((p) => p.user_id === userId)
      .sort((a, b) => b.avg_score - a.avg_score);

    const topicMastery = progressRows.map((p) => {
      let rec: string;
      if (p.avg_score >= 85) {
        rec = 'Topic mastered! Challenge yourself with advanced follow-up assessments.';
      } else if (p.avg_score >= 70) {
        rec = 'Solid comprehension. Review targeted quote passages to achieve top mastery.';
      } else {
        rec = 'Priority review area: review evidence inspector quotes and re-take practice quiz.';
      }
      return {
        topic: p.topic,
        attempts: p.total_attempts,
        avg_score: p.avg_score,
        mastery_level: p.mastery_level,
        recommendation: rec,
      };
    });

    const adaptiveRecs: string[] = [];
    const weakTopics = progressRows
      .filter((p) => p.avg_score < 75)
      .sort((a, b) => a.avg_score - b.avg_score);

    for (const w of weakTopics) {
      adaptiveRecs.push(
        `Focus revision on '${w.topic}': your average accuracy is ${w.avg_score}%. Review key concept definitions and take a targeted quiz.`
      );
    }

    const recentWrong = this.data.quizAttemptAnswers
      .filter((a) => userAttemptIds.has(a.attempt_id) && !a.is_correct)
      .sort((a, b) => b.id - a.id)
      .slice(0, 3);

    for (const rw of recentWrong) {
      const q = this.data.quizQuestions.find((qq) => qq.id === rw.question_id);
      const qz = q
        ? this.data.quizzes.find((zz) => zz.id === q.quiz_id && zz.user_id === userId)
        : undefined;
      if (rw.revision_hint && qz) {
        const msg = `Targeted Hint (${qz.topic}): ${rw.revision_hint}`;
        if (!adaptiveRecs.includes(msg)) {
          adaptiveRecs.push(msg);
        }
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

    const recentAttempts = [...userAttempts]
      .sort((a, b) => b.id - a.id)
      .slice(0, 10)
      .map((a) => {
        const qz = this.data.quizzes.find((q) => q.id === a.quiz_id && q.user_id === userId);
        return {
          attempt_id: a.id,
          quiz_id: a.quiz_id,
          quiz_title: qz ? qz.title : `Quiz #${a.quiz_id}`,
          topic: qz ? qz.topic : 'General',
          score: a.score,
          total_questions: a.total_questions,
          score_percentage: a.score_percentage,
          completed_at: a.completed_at,
        };
      });

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

export const store = new StudyStore();
