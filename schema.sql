-- NoteBound AI - MySQL Relational Database Schema
-- Automatically executed on server startup when MYSQL_HOST is reachable,
-- or can be run manually in MySQL Workbench / MySQL CLI.

CREATE DATABASE IF NOT EXISTS notebound_ai
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE notebound_ai;

-- 1. Users Table (Email + Bcrypt Password Hash)
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. User Sessions Table (SHA-256 Hashed Session Tokens)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Study Notes Library (PDF / TXT / MD / Pasted Notes per User)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Parsed Document Sections per Note
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. AI-Generated Quizzes per User
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Quiz Questions & Grounded Evidence Quotes
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Quiz Assessments / Recent Quiz History per User
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Per-Question Attempt Answers & Adaptive Study Hints
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Per-User Topic Mastery Breakdown
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Grounded Q&A History per User
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
