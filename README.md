# NoteBound AI

> **An evidence-grounded AI learning platform with per-user MySQL storage, verified source quotations, interactive evidence inspection, adaptive multi-choice quizzes, and persistent progress analytics.**

---

## Architecture Overview

- **Frontend**: Responsive HTML5, Tailwind CSS v4 (Dark Mode & Light Mode switch), and modular Vanilla JavaScript (`index.html`, `src/app.js`, `src/index.css`).
- **Backend**: Node.js + Express + TypeScript (`server.ts`, `src/server/*`) serving both REST API routes (`/api/*`), Swagger/OpenAPI docs (`/docs`), and Vite frontend on port `3000`.
- **Database**: **MySQL 8.0+** (`mysql2/promise` connection pool) with automatic database & schema creation (`notebound_ai`) and `bcryptjs` salted password hashing.
- **AI Engine**: Grounded Gemma / Gemini inference via `@google/genai` (`GEMINI_API_KEY` kept strictly server-side).
- **Document Processing**: Multi-page PDF (`unpdf`), Markdown (`.md`), and plain-text (`.txt`) extraction with chunked large-file upload support (up to 200 MB) and character-offset quotation verification.

---

## Local Deployment Guide (With Local MySQL)

### 1. Prerequisites
Install the following on your computer (Windows, macOS, or Linux):
1. **Node.js 22+** (includes `npm`) — [nodejs.org](https://nodejs.org/)
2. **MySQL Server 8.0+** (or MariaDB 10.6+) — [dev.mysql.com/downloads/mysql](https://dev.mysql.com/downloads/mysql/)
   - Make sure the MySQL Server service is **running** on port `3306`.
3. **Google Gemini API Key** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

---

### 2. Download & Install Dependencies
1. Export / download this project from Google AI Studio (click the **Download / Export ZIP** icon in the top bar) and unzip it on your computer.
2. Open a terminal in the project folder and install Node packages:
   ```bash
   npm install
   ```

---

### 3. Configure `.env` for Your Local MySQL Server
1. Copy `.env.example` to `.env`:
   - **macOS / Linux**:
     ```bash
     cp .env.example .env
     ```
   - **Windows (PowerShell / CMD)**:
     ```powershell
     copy .env.example .env
     ```
2. Open `.env` in your code editor and fill in your `GEMINI_API_KEY` and your local MySQL credentials:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key

   GEMMA_MODEL_NAME=gemma-4-26b-a4b-it
   FALLBACK_MODEL_NAME=gemini-3.8-flash
   PORT=3000

   # Local MySQL Server Settings
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=your_local_mysql_password
   MYSQL_DATABASE=notebound_ai
   MYSQL_SSL=false
   MYSQL_STRICT=true
   ```
   *(Note: You do **not** need to manually create the database or tables—NoteBound AI automatically executes `CREATE DATABASE IF NOT EXISTS notebound_ai` and creates all 10 relational tables on startup. If you prefer to inspect or run the SQL manually in MySQL Workbench, open `schema.sql`.)*

---

### 4. Verify Your MySQL Connection & Tables
Run the built-in verification utility to confirm NoteBound AI can reach your local MySQL server and provision all 10 per-user tables:
```bash
npm run db:verify
```
You should see output listing all 10 verified tables (`users`, `user_sessions`, `notes`, `note_sections`, `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_attempt_answers`, `learning_progress`, `qa_history`).

---

### 5. Start NoteBound AI Locally

#### Option A: Development Mode
```bash
npm run dev
```
Open **http://localhost:3000** in your browser.
In your terminal, you will see:
```text
[DB] Connected to MySQL (127.0.0.1:3306/notebound_ai)
[🚀] NoteBound AI server active on port 3000
```

#### Option B: Production Build Mode
Compile the optimized frontend bundle into `dist/` and start the production Node.js server:
- **macOS / Linux**:
  ```bash
  npm run build
  NODE_ENV=production npm start
  ```
- **Windows (PowerShell)**:
  ```powershell
  npm run build
  $env:NODE_ENV="production"; npm start
  ```

---

## Per-User MySQL Schema (`notebound_ai`)

Every user who registers on the Login page gets isolated relational records keyed by `user_id`:
- `users` — Full name, unique email, `bcryptjs` password hash
- `user_sessions` — SHA-256 hashed 30-day session tokens
- `notes` — Uploaded PDFs/TXT/MD & pasted notes (`LONGTEXT` extracted content, word & character counts)
- `note_sections` — Structured document sections & character offsets
- `quizzes` & `quiz_questions` — AI-generated multi-choice quizzes, explanations, quotes, and revision hints
- `quiz_attempts` & `quiz_attempt_answers` — Complete assessment score history and missed-question hints
- `learning_progress` — Per-user topic mastery breakdown (`Needs Practice`, `Proficient`, `Mastered`)
- `qa_history` — Saved Grounded Q&A responses and verified citation metadata
