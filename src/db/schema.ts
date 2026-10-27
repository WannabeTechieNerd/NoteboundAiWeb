import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// 1. Users Table (supports Firebase Auth UID, profile onboarding, and central library mapping)
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').unique(),
    fullName: text('full_name').notNull(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').default('').notNull(),
    course: text('course').default('').notNull(),
    stream: text('stream').default('').notNull(),
    college: text('college').default('').notNull(),
    university: text('university').default('').notNull(),
    isProfileCompleted: boolean('is_profile_completed').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }
);

// 2. User Sessions Table
export const userSessions = pgTable(
  'user_sessions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }
);

// 3. Study Notes Library (with cross-user deduplication & Central Library sharing)
export const notes = pgTable(
  'notes',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    topic: text('topic').notNull(),
    fileType: text('file_type').default('txt').notNull(),
    originalFilename: text('original_filename'),
    content: text('content').notNull(),
    charCount: integer('char_count').default(0).notNull(),
    wordCount: integer('word_count').default(0).notNull(),
    contentHash: text('content_hash').default('').notNull(),
    isShared: boolean('is_shared').default(true).notNull(),
    authorName: text('author_name').default(''),
    authorCollege: text('author_college').default(''),
    authorUniversity: text('author_university').default(''),
    authorCourse: text('author_course').default(''),
    authorStream: text('author_stream').default(''),
    isDuplicate: boolean('is_duplicate').default(false).notNull(),
    canonicalNoteId: integer('canonical_note_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }
);

// 4. Parsed Document Sections
export const noteSections = pgTable(
  'note_sections',
  {
    id: serial('id').primaryKey(),
    noteId: integer('note_id')
      .references(() => notes.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sectionIndex: integer('section_index').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    startChar: integer('start_char').default(0).notNull(),
    endChar: integer('end_char').default(0).notNull(),
  }
);

// 5. AI-Generated Quizzes
export const quizzes = pgTable(
  'quizzes',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    noteId: integer('note_id').references(() => notes.id, {
      onDelete: 'set null',
    }),
    topic: text('topic').notNull(),
    title: text('title').notNull(),
    difficulty: text('difficulty').default('Medium').notNull(),
    questionCount: integer('question_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }
);

// 6. Quiz Questions & Grounded Evidence Quotes
export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: serial('id').primaryKey(),
    quizId: integer('quiz_id')
      .references(() => quizzes.id, { onDelete: 'cascade' })
      .notNull(),
    questionOrder: integer('question_order').notNull(),
    questionText: text('question_text').notNull(),
    optionA: text('option_a').notNull(),
    optionB: text('option_b').notNull(),
    optionC: text('option_c').notNull(),
    optionD: text('option_d').notNull(),
    correctOption: text('correct_option').notNull(),
    explanation: text('explanation').notNull(),
    quoteEvidence: text('quote_evidence').notNull(),
    revisionHint: text('revision_hint').notNull(),
  }
);

// 7. Quiz Assessment Attempts
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    quizId: integer('quiz_id')
      .references(() => quizzes.id, { onDelete: 'cascade' })
      .notNull(),
    totalQuestions: integer('total_questions').notNull(),
    score: integer('score').notNull(),
    scorePercentage: real('score_percentage').notNull(),
    timeTakenSeconds: integer('time_taken_seconds').default(0).notNull(),
    completedAt: timestamp('completed_at').defaultNow().notNull(),
  }
);

// 8. Quiz Attempt Answers
export const quizAttemptAnswers = pgTable(
  'quiz_attempt_answers',
  {
    id: serial('id').primaryKey(),
    attemptId: integer('attempt_id')
      .references(() => quizAttempts.id, { onDelete: 'cascade' })
      .notNull(),
    questionId: integer('question_id')
      .references(() => quizQuestions.id, { onDelete: 'cascade' })
      .notNull(),
    selectedOption: text('selected_option').notNull(),
    isCorrect: boolean('is_correct').default(false).notNull(),
    revisionHint: text('revision_hint').notNull(),
  }
);

// 9. Topic Mastery Learning Progress
export const learningProgress = pgTable(
  'learning_progress',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    topic: text('topic').notNull(),
    totalAttempts: integer('total_attempts').default(0).notNull(),
    avgScore: real('avg_score').default(0).notNull(),
    masteryLevel: text('mastery_level').default('Needs Practice').notNull(),
    lastPracticedAt: timestamp('last_practiced_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uniq_user_topic_idx').on(table.userId, table.topic),
  ]
);

// 10. Grounded Q&A History
export const qaHistory = pgTable(
  'qa_history',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    topicFilter: text('topic_filter'),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    status: text('status').notNull(),
    isSupported: boolean('is_supported').default(false).notNull(),
    confidence: real('confidence').default(0).notNull(),
    modelUsed: text('model_used').notNull(),
    evidenceJson: text('evidence_json').notNull(),
    notesConsultedJson: text('notes_consulted_json').notNull(),
    searchGroundingUsed: boolean('search_grounding_used').default(false).notNull(),
    validityScore: real('validity_score').default(0).notNull(),
    webSourcesJson: text('web_sources_json').default('[]').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(userSessions),
  notes: many(notes),
  quizzes: many(quizzes),
  attempts: many(quizAttempts),
  learningProgress: many(learningProgress),
  qaHistory: many(qaHistory),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  author: one(users, {
    fields: [notes.userId],
    references: [users.id],
  }),
  sections: many(noteSections),
  quizzes: many(quizzes),
}));

export const noteSectionsRelations = relations(noteSections, ({ one }) => ({
  note: one(notes, {
    fields: [noteSections.noteId],
    references: [notes.id],
  }),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  author: one(users, {
    fields: [quizzes.userId],
    references: [users.id],
  }),
  note: one(notes, {
    fields: [quizzes.noteId],
    references: [notes.id],
  }),
  questions: many(quizQuestions),
  attempts: many(quizAttempts),
}));

export const quizQuestionsRelations = relations(quizQuestions, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [quizQuestions.quizId],
    references: [quizzes.id],
  }),
  answers: many(quizAttemptAnswers),
}));

export const quizAttemptsRelations = relations(quizAttempts, ({ one, many }) => ({
  user: one(users, {
    fields: [quizAttempts.userId],
    references: [users.id],
  }),
  quiz: one(quizzes, {
    fields: [quizAttempts.quizId],
    references: [quizzes.id],
  }),
  answers: many(quizAttemptAnswers),
}));

export const quizAttemptAnswersRelations = relations(quizAttemptAnswers, ({ one }) => ({
  attempt: one(quizAttempts, {
    fields: [quizAttemptAnswers.attemptId],
    references: [quizAttempts.id],
  }),
  question: one(quizQuestions, {
    fields: [quizAttemptAnswers.questionId],
    references: [quizQuestions.id],
  }),
}));
