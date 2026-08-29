# Voxit - AI Audiobook Production Studio

> An AI-powered audiobook production system built on large-model speech synthesis (TTS). Switch between multiple AI providers and fine-tune audiobooks paragraph by paragraph across chapters. Each paragraph supports custom narration/character, voice, speed, pitch, emotion and other parameters. Preview before synthesizing, then concatenate and export the full chapter audio.

## Key Features

- **Multiple AI providers**: Alibaba Cloud Bailian (CosyVoice/Qwen-TTS) and Doubao Volcano Engine (Seed-TTS), with multiple model instances configurable in system settings
- **Book management**: Book list (table view, search, edit) and book details (chapters/characters tabs)
- **Chapter management**: Chapter list with status tracking (initial/editing/synthesized) and chapter details (paragraph editing)
- **Paragraph editing**: Split layout — left side for role selection (narrator/characters) and role voice editing, right side for text editing plus speed/pitch/emotion/instruction parameters with preview/synthesize
- **Character management**: Book-level character configuration (character name → voice mapping); voices are applied automatically when selecting a character for a paragraph
- **Voice preview**: The AI voices page lists all voices for audition; each item in the voice picker dropdown has its own preview button — listen first, then choose
- **Batch synthesis**: Synthesize all paragraphs in a chapter with one click, with real-time SSE progress updates
- **Chapter export**: Concatenate paragraph audio with ffmpeg, insert inter-paragraph silence, and export the full chapter as mp3
- **Doubao long text**: Synthesize an entire chapter in a single request (async, up to 100,000 characters)
- **Batch import**: Paste an entire chapter's text and split it into paragraphs automatically
- **Dirty marking**: Paragraphs are flagged as "modified" when changed, with a prompt when switching chapters

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Ant Design 5 + React Router 7 + zustand |
| Backend | Node.js + Express + TypeScript |
| Database | node:sqlite (built into Node 24, zero compile-time dependencies) |
| Audio processing | ffmpeg-static + fluent-ffmpeg |
| TTS | Alibaba Cloud Bailian CosyVoice, Doubao Volcano Engine Seed-TTS |

## Project Structure

```
voxit/
├── apps/
│   ├── web/                 # Frontend (React + Vite)
│   │   └── src/
│   │       ├── layouts/     # Sidebar layout
│   │       ├── pages/       # Route pages (dashboard/books/chapters/AI voices/settings)
│   │       ├── components/  # Components (paragraph card/voice picker/template panel)
│   │       ├── store.ts     # Global state
│   │       └── ai-config.ts # AI model config (persisted in localStorage)
│   └── server/              # Backend (Express + TypeScript)
│       └── src/
│           ├── db/          # SQLite database + data access layer
│           ├── providers/   # TTS provider abstraction + Aliyun/Doubao implementations
│           ├── services/    # Synthesis service + audio export
│           └── routes/      # API routes
└── packages/
    └── core/                # Shared types + provider interfaces (shared by frontend/backend)
```

## Getting Started

### Prerequisites

- Node.js >= 24 (uses the built-in `node:sqlite`)
- ffmpeg (`ffmpeg-static` is installed automatically with the project, or install system-wide with `brew install ffmpeg`)

### Install & Run

```bash
cd voxit
npm install            # Install dependencies

# Terminal 1: start the backend
npm run dev:server     # http://localhost:3100

# Terminal 2: start the frontend
npm run dev:web        # http://localhost:5173
```

Open **http://localhost:5173** in your browser.

### Configure AI Models

1. Go to **System Settings** → configure the API keys and workspace IDs for Alibaba Cloud Bailian / Doubao Volcano Engine
2. Go to **AI Voices** → the voice list is fetched automatically from the models
3. Create a book → add a chapter → edit paragraphs → pick a character/voice → preview → synthesize → export

## Production Deployment

> The server is designed for single-machine deployment by default: frontend static files are served by nginx, the backend API is reverse-proxied by nginx to a Node process (managed by pm2), and data is stored in a single SQLite file. Reference configs are provided under `deploy/`.

### Prerequisites

- Node.js >= 24 (uses built-in `node:sqlite`, no separate database needed)
- ffmpeg (`brew install ffmpeg` or install via your system package manager)
- nginx (optional, skip if using another reverse proxy/hosting approach)
- pm2 (`npm i -g pm2`)

### 1. Build

```bash
cd voxit
npm install
npm run build          # Builds packages/core + apps/web + apps/server
```

Output: frontend in `apps/web/dist/`, backend in `apps/server/dist/`.

### 2. Configure Server Environment Variables

```bash
cd apps/server
cp .env.example .env
```

Be sure to change the following (the placeholder values in `.env` are insecure):

| Variable | Description |
|---|---|
| `ADMIN_PASS` | Admin password (strong password of >= 8 characters) |
| `JWT_SECRET` | Generate a random string with `openssl rand -hex 32` |
| `DATA_DIR` | **Required for production**, e.g. `/var/lib/voxit`. The database file `voxit.db`, exported audio, and temp files all live here. Without it, dev (`src/data`) and built (`dist/data`) use two separate datasets, so local data may be "invisible" after deployment |
| `CORS_ORIGINS` | The actual domain the frontend is served from, e.g. `https://your-domain.com` |
| `ALIYUN_API_KEY` etc. | TTS provider credentials |

### 3. Start the Backend (pm2)

```bash
cd voxit
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup   # auto-start on boot
```

The backend listens on `http://127.0.0.1:3100`. Security warnings are printed at startup when weak secrets/passwords are still in place.

### 4. Configure nginx (Static Hosting + Reverse Proxy)

See `deploy/nginx.conf`:

- Put the contents of `apps/web/dist` into `/var/www/voxit/web` (or point the `root` directive elsewhere)
- Change `server_name` to your domain
- Use `try_files ... /index.html` for the frontend router to support history mode
- Reverse proxy `/api/` to `http://127.0.0.1:3100` and keep `proxy_buffering off` (required for SSE progress updates)

### 5. HTTPS (recommended)

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

### Database Notes

- **Storage**: A single SQLite file at `$DATA_DIR/voxit.db`. Tables are created automatically on first startup (`vx_projects` / `vx_chapters` / `vx_paragraphs` / `vx_voice_templates`) — no manual database setup required.
- **Migrating local data to the server**: Copy the local `apps/server/src/data/voxit.db` (dev) or `apps/server/dist/data/voxit.db` (build output) to `$DATA_DIR/voxit.db` on the server; the schema is compatible.
- **Backup**: SQLite is a single file, so a plain `cp` or `sqlite3 .backup` is enough. Scheduled backup:
  ```bash
  # Backs up daily at 3 AM, keeps 30 days
  0 3 * * * /path/to/voxit/deploy/backup-db.sh >> /var/log/voxit-backup.log 2>&1
  ```
- **Login rate limiting**: Built-in in-memory limiter — after 5 consecutive failed logins from the same IP within 15 minutes, the IP is locked for 15 minutes (replace with Redis for multi-instance deployments).

## Naming Conventions

- System name: **Voxit** (Vox + it)
- Code prefix: `vx-`
- Package name: `@voxit/*`
- Component prefix: `<Vx... />`
- Database table prefix: `vx_`

## API Overview

| Route | Method | Description |
|---|---|---|
| `/api/projects` | GET/POST/PATCH/DELETE | Book CRUD |
| `/api/chapters` | GET/POST/PATCH | Chapter CRUD + rename |
| `/api/chapters/:id/export` | POST | Export full chapter audio (SSE progress) |
| `/api/chapters/:id/synthesize-all` | POST | Batch synthesis (SSE progress) |
| `/api/chapters/:id/synthesize-long` | POST | Doubao full-chapter long-text synthesis |
| `/api/paragraphs` | GET/POST/PATCH | Paragraph CRUD + synthesize + preview |
| `/api/providers` | GET | Provider list + capabilities + voices + preview |
| `/api/templates` | GET/POST/DELETE | Character voice template CRUD |

## TTS Documentation

### Alibaba Cloud:
- Realtime TTS: [https://help.aliyun.com/zh/model-studio/realtime-tts-user-guide](https://help.aliyun.com/zh/model-studio/realtime-tts-user-guide)
- Non-realtime TTS: [https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide](https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide)
- Voice cloning: [https://help.aliyun.com/zh/model-studio/voice-cloning-user-guide](https://help.aliyun.com/zh/model-studio/voice-cloning-user-guide)
- Voice design: [https://help.aliyun.com/zh/model-studio/voice-design-user-guide](https://help.aliyun.com/zh/model-studio/voice-design-user-guide)
- SSML and LaTeX: [https://help.aliyun.com/zh/model-studio/ssml-latex-user-guide](https://help.aliyun.com/zh/model-studio/ssml-latex-user-guide)
- Voice lists:
  - Qwen-Audio-TTS voice list: [https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list)
  - CosyVoice voice list: [https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list](https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list)
  - Qwen-TTS voice list: [https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list](https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list)

### Doubao Volcano Engine:
- Doubao speech documentation: [https://docs.volcengine.com/docs/6561](https://docs.volcengine.com/docs/6561)
  - Model list: [https://docs.volcengine.com/docs/6561/2499930](https://docs.volcengine.com/docs/6561/2499930/)
  - Voice list: [https://docs.volcengine.com/docs/6561/1257544](https://docs.volcengine.com/docs/6561/1257544)
- API reference: [https://docs.volcengine.com/docs/6561/1257536](https://docs.volcengine.com/docs/6561/1257536)

## Documentation

- [README.zh-CN.md](README.zh-CN.md) — 中文文档 (Chinese)

## License

MIT
