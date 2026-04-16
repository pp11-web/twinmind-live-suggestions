# TwinMind Live Suggestions

Single-page meeting copilot app for the TwinMind assignment. It records microphone audio in 30-second chunks, transcribes with Groq `whisper-large-v3`, generates exactly 3 live suggestion cards with Groq `openai/gpt-oss-120b`, and streams expanded answers into a continuous chat panel.

## Stack

- Next.js 16 + React 19 + TypeScript
- Browser `MediaRecorder` for mic capture and 30-second chunking
- Next.js route handlers as a thin Groq proxy
- No database and no server-side key storage

## Why this shape

- The app is intentionally single-page and local-state only because the assignment explicitly does not need auth or persistence.
- Suggestions use strict JSON schema mode so every refresh reliably returns exactly 3 cards with consistent fields.
- Chat responses stream from Groq through the server route to reduce perceived latency in the right-side panel.
- Prompt and context-window settings are editable in the UI so prompt quality can be tuned live.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Open `http://localhost:3000`
4. Paste your Groq API key into `Settings`

## Assignment requirements covered

- Start/stop mic button
- Transcript appended in roughly 30-second chunks
- Auto-scroll transcript to latest chunk
- Auto-refresh suggestions after each chunk
- Manual refresh button that flushes current audio and refreshes suggestions
- Exactly 3 fresh suggestion cards per batch
- Older suggestion batches remain visible
- Clicking a suggestion creates a longer-form answer in the chat panel
- Continuous session chat with typed user questions
- Export full session as JSON with timestamps
- User-pasted Groq API key
- Editable prompts and context-window settings

## Prompt strategy

- Live suggestions prioritize what is useful in the next 30 to 90 seconds rather than generic summaries.
- The model sees recent transcript context plus recent suggestion previews so it can avoid repetition.
- Expanded answers focus on reusable wording, supporting points, and caveats grounded in the transcript.
- Chat keeps a bounded transcript window plus recent chat turns to stay fast while remaining contextual.

## Groq models

- Transcription: `whisper-large-v3`
- Suggestions and chat: `openai/gpt-oss-120b`

These model IDs match Groq's current docs for Whisper Large v3 and GPT-OSS 120B.

## Tradeoffs

- The app uses browser-side recording and chunk uploads instead of lower-level audio worklets because the assignment values prompt quality and end-to-end usefulness more than production audio infrastructure.
- Session state is intentionally in-memory only. Settings are cached in browser local storage for convenience.
- There is no speaker diarization or interruption-aware chunking. The app leans on clean prompting plus recent context windows instead.

## Deployment

Deploy on Vercel as a standard Next.js app.

- Framework preset: `Next.js`
- No environment variables are required
- Users paste their own Groq API key in the running app
