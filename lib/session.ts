import { GROQ_MODELS } from "@/lib/defaults";
import type {
  AppSettings,
  ChatMessage,
  SessionExport,
  SuggestionBatch,
  TranscriptChunk,
} from "@/lib/types";

export function sanitizeSettings(settings: AppSettings): Omit<AppSettings, "apiKey"> {
  const { apiKey: _apiKey, ...rest } = settings;
  return rest;
}

export function buildSessionExport(args: {
  settings: AppSettings;
  transcript: TranscriptChunk[];
  suggestionBatches: SuggestionBatch[];
  chatHistory: ChatMessage[];
}): SessionExport {
  return {
    exportedAt: new Date().toISOString(),
    models: GROQ_MODELS,
    settings: sanitizeSettings(args.settings),
    transcript: args.transcript,
    suggestionBatches: args.suggestionBatches,
    chatHistory: args.chatHistory,
  };
}

export function downloadJsonExport(payload: SessionExport) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `twinmind-session-${new Date().toISOString().replaceAll(":", "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatClock(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatRange(startIso: string, endIso: string) {
  return `${formatClock(startIso)}-${formatClock(endIso)}`;
}

export function getTranscriptWindow(chunks: TranscriptChunk[], limit: number) {
  return chunks.slice(Math.max(0, chunks.length - limit));
}

export function transcriptToPrompt(chunks: TranscriptChunk[]) {
  return chunks
    .map(
      (chunk, index) =>
        `[chunk ${index + 1} | ${formatRange(chunk.startedAt, chunk.endedAt)}]\n${chunk.text}`,
    )
    .join("\n\n");
}
