# B.A.R.B.I 2.0 — Brilliant Adaptive Reasoning Brain Interface

B.A.R.B.I is a cross-platform Personal Intelligent Operating System (PIOS) uniting a 3D Three.js/WebGL cognitive sphere (with live artificial neurons inside the innermost core), ARCHIVEX Cloud SQL PostgreSQL + `pgvector` semantic memory, Windows local folder sync, multi-provider free-tier AI orchestration with hard pre-flight quota failover, laptop webcam hand-gesture control, R.E.A. agent/system forge & live hosting, and a NotebookLM-style Study & Explainer Video studio.

## Environment Secrets (Server-Side Only)

Configure API keys in **Settings > Secrets** (never paste keys in frontend code or browser storage):

- `GEMINI_API_KEY` *(Primary Google Gemini reasoning, embeddings `gemini-embedding-2`, and voice transcription)*
- Optional additional free-tier pool keys:
  - `GROQ_API_KEY` (GroqCloud LPU Free Tier)
  - `OPENROUTER_API_KEY` (OpenRouter `:free` models + Mistral `:free` relay, no phone SMS)
  - `GITHUB_TOKEN` (GitHub Models free tier — PAT with `models:read`, no card / no phone SMS)
  - `CEREBRAS_API_KEY` (Cerebras Inference Free Tier)
  - `MISTRAL_API_KEY` (Mistral La Plateforme Experiment — optional; requires SMS verification)
  - `HF_TOKEN` (Hugging Face Inference Router)
  - `OLLAMA_BASE_URL` (Local Edge Ollama instance, e.g., `http://localhost:11434`)
- Cloud SQL PostgreSQL (`europe-west2`): `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`

## Key Capabilities

1. **Free-Tier Quota Guard Pop-up**: Tracks RPM, RPD, TPM, and TPD ceilings per provider (`>= 0` headroom check). Throws `#ai-quota-warning-modal` with an 8-second countdown and automatically fails over to the next best provider if ignored so workflows never halt.
2. **Real Laptop Webcam Hand-Gesture Control**: Uses `@mediapipe/tasks-vision` `HandLandmarker` (local `/mediapipe-wasm` + GPU/CPU auto-fallback + optical motion fallback) for pointer tracking, pinch selection, ✌️ two-finger sphere orbit, ✋ open palm voice toggle, ✊ fist reset, and swipe ring stepping, alongside open-source webcam gesture repo presets.
3. **R.E.A. Platform/GUI Study, Agent Forge & System Builder**:
   - Inspects public URLs via SSRF-guarded DOM topology extraction.
   - Generates custom agents (`POST /api/rea/build-agent`) and full multi-file Web + Node/Express + Tauri v2 Windows `.exe`/`.msi` systems (`POST /api/rea/build-system`) immediately hosted live at `/hosted/:slug/` and exportable as `.zip`.
4. **NotebookLM-Style Study & Animated Explainer Video Studio**:
   - Generates Executive Summaries, Key Concepts/Equations, Click-to-Flip Flashcards, Graded MCQ Quizzes, and a 4–6 scene animated Canvas Explainer Video with Web Speech narration and `.webm` export.
5. **ARCHIVEX Persistence & Windows Sync**:
   - Cloud SQL PostgreSQL + `pgvector` (`ivfflat` cosine search) + Firebase Google Auth + File System Access API Windows directory mirror (`barbi-archivex-snapshot.json`).

## Development & Cross-Platform Packaging

```bash
npm install
npm run dev          # Full-stack Express + Vite server on port 3000
npm run lint         # TypeScript check
npm run build        # Production web + PWA bundle into dist/
```

- **PWA**: Installable directly on Windows, macOS, Android, and iOS via `vite-plugin-pwa`.
- **Windows Desktop (`.exe` / `.msi`)**: Requires Rust + Tauri CLI (`cargo tauri build` inside repo with `/src-tauri`).
- **Android (`.apk` / `.aab`)**: Sync `dist/` via Capacitor (`npx cap sync android`) using `/capacitor.config.ts`.
