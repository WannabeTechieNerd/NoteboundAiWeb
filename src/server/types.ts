export interface UserRecord {
  id: number;
  full_name: string;
  email: string;
  password_hash: string;
  course: string;
  stream: string;
  college: string;
  university: string;
  is_profile_completed: boolean;
  created_at: string;
}

export interface PublicUser {
  id: number;
  full_name: string;
  email: string;
  course: string;
  stream: string;
  college: string;
  university: string;
  is_profile_completed: boolean;
  created_at: string;
}

export interface UserSessionRecord {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface NoteSection {
  id: number;
  note_id: number;
  user_id: number;
  section_index: number;
  title: string;
  content: string;
  start_char: number;
  end_char: number;
}

export interface NoteRecord {
  id: number;
  user_id: number;
  title: string;
  topic: string;
  file_type: string;
  original_filename: string | null;
  content: string;
  char_count: number;
  word_count: number;
  content_hash?: string;
  is_shared?: boolean;
  author_name?: string;
  author_college?: string;
  author_university?: string;
  author_course?: string;
  author_stream?: string;
  is_duplicate?: boolean;
  canonical_note_id?: number | null;
  storage_saved?: boolean;
  created_at: string;
}

export interface EvidenceItem {
  quote: string;
  verified: boolean;
  match_percentage: number;
  start_char: number;
  end_char: number;
  surrounding_passage: string;
  line_number: number;
  note_title: string;
  section_title: string;
  status: string;
}

export interface WebSourceItem {
  title: string;
  uri: string;
}

export interface QuestionAnswerResponse {
  status: 'SUPPORTED' | 'INSUFFICIENT_EVIDENCE' | 'WEB_GROUNDED';
  is_supported: boolean;
  answer: string;
  evidence_list: EvidenceItem[];
  model_used: string;
  notes_consulted: string[];
  confidence: number;
  search_grounding_used?: boolean;
  validity_score?: number;
  web_sources?: WebSourceItem[];
  source_type?: 'notes' | 'web';
}

export interface QaHistoryRecord {
  id: number;
  user_id: number;
  topic_filter: string | null;
  question: string;
  answer: string;
  status: 'SUPPORTED' | 'INSUFFICIENT_EVIDENCE' | 'WEB_GROUNDED';
  is_supported: boolean;
  confidence: number;
  model_used: string;
  evidence_list: EvidenceItem[];
  notes_consulted: string[];
  search_grounding_used?: boolean;
  validity_score?: number;
  web_sources?: WebSourceItem[];
  created_at: string;
}

export interface QuizRecord {
  id: number;
  user_id: number;
  note_id: number | null;
  topic: string;
  title: string;
  difficulty: string;
  question_count: number;
  created_at: string;
}

export interface QuizQuestionRecord {
  id: number;
  quiz_id: number;
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
}

export interface QuizAttemptRecord {
  id: number;
  user_id: number;
  quiz_id: number;
  total_questions: number;
  score: number;
  score_percentage: number;
  time_taken_seconds: number;
  completed_at: string;
}

export interface QuizAttemptAnswerRecord {
  id: number;
  attempt_id: number;
  question_id: number;
  selected_option: string;
  is_correct: boolean;
  revision_hint: string;
}

export interface LearningProgressRecord {
  user_id: number;
  topic: string;
  total_attempts: number;
  avg_score: number;
  mastery_level: string;
  last_practiced_at: string;
}
