export type SuggestionKind =
  | "answer"
  | "next_question"
  | "talking_point"
  | "clarification"
  | "fact_check";

export type RefreshTrigger = "auto" | "manual" | "stop";

export type TranscriptChunk = {
  id: string;
  text: string;
  createdAt: string;
  startedAt: string;
  endedAt: string;
  seconds: number;
  language?: string;
};

export type Suggestion = {
  id: string;
  kind: SuggestionKind;
  title: string;
  preview: string;
  prompt: string;
  whyNow: string;
};

export type SuggestionBatch = {
  id: string;
  createdAt: string;
  trigger: RefreshTrigger;
  sourceChunkIds: string[];
  suggestions: Suggestion[];
};

export type ChatMessageSource = "typed" | "suggestion";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  source: ChatMessageSource;
  suggestionId?: string;
  status?: "streaming" | "done" | "error";
};

export type AppSettings = {
  apiKey: string;
  liveSuggestionPrompt: string;
  detailPrompt: string;
  chatPrompt: string;
  suggestionContextChunks: number;
  detailContextChunks: number;
  chatContextChunks: number;
  chatHistoryTurns: number;
  transcriptLanguage: string;
  transcriptionHint: string;
  chunkSeconds: number;
  previewCharLimit: number;
  suggestionTemperature: number;
  detailTemperature: number;
  chatTemperature: number;
  suggestionReasoningEffort: "low" | "medium" | "high";
  detailReasoningEffort: "low" | "medium" | "high";
  chatReasoningEffort: "low" | "medium" | "high";
};

export type SessionExport = {
  exportedAt: string;
  models: {
    transcription: string;
    reasoning: string;
  };
  settings: Omit<AppSettings, "apiKey">;
  transcript: TranscriptChunk[];
  suggestionBatches: SuggestionBatch[];
  chatHistory: ChatMessage[];
};
