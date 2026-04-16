# TwinMind Live Suggestions

Live meeting copilot built for the TwinMind assignment. The app records microphone audio in roughly 30-second chunks, transcribes each chunk with Groq `whisper-large-v3`, generates exactly 3 live suggestion cards with Groq `openai/gpt-oss-120b`, and streams longer expanded answers into a continuous chat panel when a suggestion is clicked or a user asks a direct question.

## What the app does

- Left column: records mic audio and appends transcript chunks with timestamps
- Middle column: generates exactly 3 fresh live suggestions after each refresh
- Right column: keeps one continuous chat session for clicked suggestions and typed questions
- Settings drawer: lets the user paste their own Groq API key and tune prompts, context windows, and generation settings
- Export: downloads the full session as JSON with transcript, suggestion batches, chat history, and timestamps

## Tech stack

- Next.js 16
- React 19
- TypeScript
- Browser `MediaRecorder` for audio capture
- Next.js route handlers as a thin Groq proxy
- Groq `whisper-large-v3` for transcription
- Groq `openai/gpt-oss-120b` for suggestions and chat

## Why this architecture

- The assignment does not require auth or persistence, so the app is intentionally single-page and session-based.
- Audio is captured in the browser and uploaded chunk-by-chunk instead of building a more complex live streaming audio pipeline.
- Suggestions use strict structured output so the app can reliably render exactly 3 cards every time.
- Chat responses are streamed for better perceived latency.
- Prompts and context settings are editable in the UI because prompt quality is one of the core evaluation criteria.

## Project structure

```text
app/
  api/
    chat/route.ts          Streamed Groq chat proxy
    suggestions/route.ts   Live suggestions generation proxy
    transcribe/route.ts    Whisper transcription proxy
  globals.css              App styling
  layout.tsx               Root layout
  page.tsx                 Main entry page

components/
  AppShell.tsx             Main UI and browser-side session logic
  SettingsPanel.tsx        Settings drawer UI

lib/
  defaults.ts              Default prompts, settings, and model ids
  groq.ts                  Shared Groq request helpers
  session.ts               Export helpers and transcript formatting
  types.ts                 Shared TypeScript types
```

## Requirements covered

- Start/stop mic button
- Transcript appended in roughly 30-second chunks
- Auto-scroll to latest transcript line
- Auto-refresh suggestions after each chunk
- Manual refresh button that flushes current audio and refreshes suggestions
- Exactly 3 fresh suggestions per batch
- Older suggestion batches stay visible
- Suggestion cards have useful previews before click
- Clicking a suggestion opens a longer-form answer in the chat panel
- Users can type their own questions
- One continuous session chat
- Export of transcript, suggestion batches, and chat history with timestamps
- User-provided Groq API key
- Editable prompts and context window settings

## How to run the project locally

### Prerequisites

- Node.js installed
- npm installed
- A Groq API key from `https://console.groq.com/keys`
- A browser with microphone support

If Node.js is not installed on macOS, one option is:

```bash
brew install node
```

### Install dependencies

From the project directory:

```bash
cd TwinMind
npm install
```

### Run in development

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

### First-time app usage

1. Open the app in the browser.
2. Click `Settings`.
3. Paste your Groq API key into the `Groq API key` field.
4. Close the settings drawer.
5. Click `Start mic`.
6. Allow microphone access in the browser.
7. Speak for about 30 seconds to produce the first transcript chunk.
8. Wait for the suggestion batch to appear, or click `Refresh now` to flush the current audio and refresh manually.
9. Click a suggestion card to generate a detailed answer in chat.
10. Type direct questions in the chat box if needed.
11. Click `Export session` to download the JSON session record.

### Run a production build locally

Build:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

### Commands summary

```bash
npm install
npm run dev
npm run build
npm run start
```

## How the app works

### Transcript flow

- The browser starts recording with `MediaRecorder`.
- Audio is chunked at the configured interval, default `30` seconds.
- Each chunk is sent to `/api/transcribe`.
- The server route forwards the file to Groq Whisper.
- The transcript is appended to the left panel with timestamps.

### Suggestions flow

- After a new transcript chunk is added, the app automatically requests suggestions.
- The app sends the most recent configured transcript window plus recent suggestion previews.
- The suggestions route enforces a strict JSON schema with exactly 3 items.
- A new batch is inserted at the top of the middle column.

### Chat flow

- Clicking a suggestion sends the suggestion prompt plus transcript context to `/api/chat`.
- Typing in the chat uses the general chat prompt plus recent transcript and chat history.
- The response is streamed into the right panel.

### Settings flow

- Settings are stored in browser local storage for convenience.
- Session transcript, suggestion batches, and chat history remain in memory only.
- Reloading the page clears the session but retains settings.

## Default prompt strategy

### Live suggestions

The default live suggestion prompt is optimized for immediate utility in the next 30 to 90 seconds of the meeting. It explicitly pushes the model to:

- prioritize what the user should say next
- answer direct questions that were just asked
- surface clarifications or fact checks only when materially useful
- avoid generic meeting advice
- produce variety across the 3 cards

### Expanded answers

The click-to-expand prompt focuses on:

- a direct answer or recommended wording
- 2 to 4 transcript-grounded supporting points
- risks or caveats where needed
- at most one useful follow-up question

### Chat

The general chat prompt keeps answers concise and grounded in the current transcript and recent chat history.

## Default settings

- Chunk length: `30` seconds
- Suggestion context window: `6` transcript chunks
- Expanded answer context window: `12` transcript chunks
- Chat transcript window: `12` transcript chunks
- Chat history turns: `8`
- Suggestion preview limit: `180` characters
- Suggestion temperature: `0.35`
- Expanded answer temperature: `0.35`
- Chat temperature: `0.45`

These defaults are defined in `lib/defaults.ts`.

## Models used

- Transcription: `whisper-large-v3`
- Suggestions: `openai/gpt-oss-120b`
- Chat: `openai/gpt-oss-120b`

## Problems faced during implementation

### 1. No starter project was provided

The workspace initially only contained the assignment document. The app had to be scaffolded from scratch, including the Next.js app shell, API routes, settings system, export format, and deployment-ready configuration.

### 2. Local JavaScript runtime was missing

`node` and `npm` were not initially available in the shell environment. Node had to be installed before the project could be created, dependencies installed, and the production build verified.

### 3. Guaranteeing exactly 3 suggestion cards

If suggestions are generated as plain free-form text, parsing becomes fragile and card counts can drift. To solve that, the suggestions route uses strict structured JSON schema output so the app can depend on exactly 3 items with known fields.

### 4. Manual refresh during an active recording session

The assignment requires a manual refresh that updates transcript first, then suggestions. That is awkward with a timed recorder because the current chunk may still be in progress. The implementation uses `MediaRecorder.requestData()` to flush the active chunk on demand and then continues recording.

### 5. Avoiding overlapping chunk processing

Audio chunk transcription and suggestion generation can overlap if the user refreshes while a chunk is already being processed. The app uses a queued promise chain so audio chunks are processed sequentially instead of racing each other.

### 6. Keeping suggestion batches fresh instead of repetitive

Without guardrails, the model can repeat similar suggestions across adjacent batches. The app includes recent suggestion previews in the suggestion request so the model is explicitly told what to avoid repeating.

### 7. Streaming chat cleanly into the UI

The chat route proxies a streaming Groq response, and the client incrementally parses server-sent event chunks. This required handling partial buffers, status updates, and failure states without leaving the assistant bubble stuck in a loading state.

### 8. Clear error handling for user setup problems

The most common failure states are missing API key and microphone permission denial. The UI surfaces these as direct banners so the user can immediately recover.

## Tradeoffs

- Browser-side chunk recording was chosen over lower-level real-time audio infrastructure to keep the implementation focused on usefulness and prompt quality.
- There is no speaker diarization.
- There is no persistent backend session storage.
- Settings persist in local storage, but transcript and chat do not persist across reload.
- The export format is JSON only, not plain text.

## Known limitations

- Suggestions only refresh after a new chunk or a manual refresh. They are not regenerated continuously token-by-token.
- Transcript quality depends heavily on microphone quality and ambient noise.
- The app does not identify speakers.
- If Groq returns an upstream error or rate limit, the session stays intact but that individual action fails.

## Troubleshooting

### Banner says: `Add a Groq API key in Settings before starting the mic.`

Open `Settings` and paste a valid Groq API key.

### Microphone does not start

- Check browser microphone permissions.
- Make sure no other app is blocking mic access.
- Try Chrome if another browser has recorder issues.

### Transcript does not appear

- Speak long enough to produce a chunk.
- Click `Refresh now` to flush the current chunk immediately.
- Verify the Groq API key is valid.

### Suggestions do not appear

- Make sure at least one transcript chunk exists.
- Check the error banner for a Groq API error.
- Try `Refresh now` after a transcript chunk appears.

### Chat does not respond

- Check whether the app still has a valid Groq API key.
- Retry with a shorter typed prompt.
- Check whether the upstream Groq request failed in the banner.

## Deployment

This app can be deployed on Vercel as a standard Next.js app.

### GitHub

Initialize and push the repo:

```bash
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<your-username>/twinmind-live-suggestions.git
git push -u origin main
```

### Vercel

1. Go to `https://vercel.com/new`
2. Import the GitHub repository
3. Let Vercel auto-detect the framework as `Next.js`
4. Deploy with default settings

No server environment variables are required for this project because the user enters the Groq API key in the app UI.

## Verification performed

- Dependencies installed successfully with `npm install`
- Production build completed successfully with `npm run build`

End-to-end microphone and Groq verification still requires:

- a real browser session
- microphone permission
- a valid Groq API key pasted into the app
