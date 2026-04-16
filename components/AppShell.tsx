"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, STORAGE_KEY } from "@/lib/defaults";
import {
  buildSessionExport,
  downloadJsonExport,
  formatClock,
  formatRange,
  getTranscriptWindow,
  transcriptToPrompt,
} from "@/lib/session";
import type {
  AppSettings,
  ChatMessage,
  ChatMessageSource,
  RefreshTrigger,
  Suggestion,
  SuggestionBatch,
  TranscriptChunk,
} from "@/lib/types";
import { SettingsPanel } from "@/components/SettingsPanel";

type TranscriptionResponse = {
  text: string;
  language?: string;
  duration?: number;
  error?: string;
};

type SuggestionsResponse = {
  suggestions?: Array<{
    kind: Suggestion["kind"];
    title: string;
    preview: string;
    prompt: string;
    whyNow: string;
  }>;
  error?: string;
};

const KIND_LABELS: Record<Suggestion["kind"], string> = {
  answer: "Answer",
  next_question: "Next question",
  talking_point: "Talking point",
  clarification: "Clarification",
  fact_check: "Fact check",
};

function pickMimeType() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return options.find((option) => MediaRecorder.isTypeSupported(option));
}

function clampText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function renderMarkdownish(content: string) {
  return content.split("\n").map((line, index) => (
    <p key={`${index}-${line.slice(0, 16)}`} className="chat-line">
      {line}
    </p>
  ));
}

function parseSseDelta(rawEvent: string) {
  const lines = rawEvent.split("\n");

  for (const line of lines) {
    if (!line.startsWith("data:")) {
      continue;
    }

    const data = line.slice(5).trim();

    if (!data || data === "[DONE]") {
      continue;
    }

    const payload = JSON.parse(data) as {
      choices?: Array<{
        delta?: {
          content?: string;
        };
      }>;
    };

    return payload.choices?.[0]?.delta?.content ?? "";
  }

  return "";
}

export function AppShell() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);
  const [suggestionBatches, setSuggestionBatches] = useState<SuggestionBatch[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const transcriptRef = useRef<TranscriptChunk[]>([]);
  const suggestionBatchesRef = useRef<SuggestionBatch[]>([]);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunkQueueRef = useRef(Promise.resolve(false));
  const currentChunkStartRef = useRef<number>(0);
  const nextChunkTriggerRef = useRef<RefreshTrigger>("auto");
  const flushResolverRef = useRef<((result: { hadTranscript: boolean }) => void) | null>(null);

  const transcriptViewportRef = useRef<HTMLDivElement | null>(null);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return;
    }

    try {
      const saved = JSON.parse(raw) as Partial<AppSettings>;
      const next = { ...DEFAULT_SETTINGS, ...saved };
      setSettings(next);
      settingsRef.current = next;
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    transcriptRef.current = transcriptChunks;
    transcriptViewportRef.current?.scrollTo({
      top: transcriptViewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [transcriptChunks]);

  useEffect(() => {
    suggestionBatchesRef.current = suggestionBatches;
  }, [suggestionBatches]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
    chatViewportRef.current?.scrollTo({
      top: chatViewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages]);

  useEffect(() => {
    return () => {
      stopRecordingTracks();
    };
  }, []);

  function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function setChatState(next: ChatMessage[]) {
    chatMessagesRef.current = next;
    startTransition(() => setChatMessages(next));
  }

  function appendChatMessage(message: ChatMessage) {
    setChatState([...chatMessagesRef.current, message]);
  }

  function updateChatMessage(id: string, patch: Partial<ChatMessage>) {
    setChatState(
      chatMessagesRef.current.map((message) =>
        message.id === id ? { ...message, ...patch } : message,
      ),
    );
  }

  function setTranscriptState(next: TranscriptChunk[]) {
    transcriptRef.current = next;
    startTransition(() => setTranscriptChunks(next));
  }

  function setSuggestionState(next: SuggestionBatch[]) {
    suggestionBatchesRef.current = next;
    startTransition(() => setSuggestionBatches(next));
  }

  function stopRecordingTracks() {
    mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  async function transcribeAudioChunk(
    blob: Blob,
    startedAt: string,
    endedAt: string,
    trigger: RefreshTrigger,
  ) {
    if (!settingsRef.current.apiKey.trim()) {
      throw new Error("Add a Groq API key in Settings before starting the mic.");
    }

    const formData = new FormData();
    formData.append("apiKey", settingsRef.current.apiKey);
    formData.append("language", settingsRef.current.transcriptLanguage);
    formData.append("prompt", settingsRef.current.transcriptionHint);
    formData.append("file", new File([blob], `chunk-${Date.now()}.webm`, { type: blob.type || "audio/webm" }));

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as TranscriptionResponse;

    if (!response.ok) {
      throw new Error(payload.error ?? "Transcription failed.");
    }

    const text = payload.text.trim();

    if (!text) {
      return false;
    }

    const chunk: TranscriptChunk = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
      startedAt,
      endedAt,
      seconds: Math.max(
        1,
        payload.duration
          ? Math.round(payload.duration)
          : Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000),
      ),
      language: payload.language,
    };

    const nextChunks = [...transcriptRef.current, chunk];
    setTranscriptState(nextChunks);

    await requestSuggestions(nextChunks, trigger);

    return true;
  }

  function enqueueAudioChunk(blob: Blob, startedAt: string, endedAt: string, trigger: RefreshTrigger) {
    const job = chunkQueueRef.current
      .then(async () => {
        if (blob.size === 0) {
          return false;
        }

        setIsTranscribing(true);
        setErrorMessage(null);

        try {
          return await transcribeAudioChunk(blob, startedAt, endedAt, trigger);
        } finally {
          setIsTranscribing(false);
        }
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : "Audio processing failed.");
        return false;
      });

    chunkQueueRef.current = job;
    return job;
  }

  async function requestSuggestions(chunks: TranscriptChunk[], trigger: RefreshTrigger) {
    if (!chunks.length) {
      return;
    }

    setIsRefreshing(true);
    setErrorMessage(null);

    const recentChunks = getTranscriptWindow(chunks, settingsRef.current.suggestionContextChunks);
    const transcriptContext = transcriptToPrompt(recentChunks);
    const priorSuggestions = suggestionBatchesRef.current
      .slice(0, 4)
      .flatMap((batch) => batch.suggestions)
      .map((suggestion) => `${suggestion.title}: ${suggestion.preview}`);

    try {
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: settingsRef.current.apiKey,
          liveSuggestionPrompt: settingsRef.current.liveSuggestionPrompt,
          transcriptContext,
          priorSuggestions,
          previewCharLimit: settingsRef.current.previewCharLimit,
          trigger,
          temperature: settingsRef.current.suggestionTemperature,
          reasoningEffort: settingsRef.current.suggestionReasoningEffort,
        }),
      });

      const payload = (await response.json()) as SuggestionsResponse;

      if (!response.ok || !payload.suggestions) {
        throw new Error(payload.error ?? "Suggestion generation failed.");
      }

      const batch: SuggestionBatch = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        trigger,
        sourceChunkIds: recentChunks.map((chunk) => chunk.id),
        suggestions: payload.suggestions.map((suggestion) => ({
          id: crypto.randomUUID(),
          kind: suggestion.kind,
          title: suggestion.title.trim(),
          preview: clampText(suggestion.preview.trim(), settingsRef.current.previewCharLimit),
          prompt: suggestion.prompt.trim(),
          whyNow: suggestion.whyNow.trim(),
        })),
      };

      setSuggestionState([batch, ...suggestionBatchesRef.current]);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function startRecording() {
    try {
      if (!settingsRef.current.apiKey.trim()) {
        throw new Error("Add a Groq API key in Settings before starting the mic.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      currentChunkStartRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        const trigger = nextChunkTriggerRef.current;
        nextChunkTriggerRef.current = "auto";

        const chunkStart = currentChunkStartRef.current;
        const chunkEnd = Date.now();
        currentChunkStartRef.current = chunkEnd;

        const job = enqueueAudioChunk(
          event.data,
          new Date(chunkStart).toISOString(),
          new Date(chunkEnd).toISOString(),
          trigger,
        );

        const resolver = flushResolverRef.current;
        flushResolverRef.current = null;

        if (resolver) {
          void job.then((hadTranscript) => resolver({ hadTranscript })).catch(() => resolver({ hadTranscript: false }));
        }
      };

      recorder.onerror = () => {
        setErrorMessage("The browser recorder hit an unexpected error.");
      };

      recorder.onstop = () => {
        setIsRecording(false);
        stopRecordingTracks();
      };

      recorder.start(settingsRef.current.chunkSeconds * 1000);
      setIsRecording(true);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Mic access failed.");
      stopRecordingTracks();
    }
  }

  async function stopRecording() {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      return;
    }

    nextChunkTriggerRef.current = "stop";
    recorder.stop();
  }

  async function handleRefresh() {
    try {
      setErrorMessage(null);

      if (!transcriptRef.current.length && !isRecording) {
        throw new Error("Start the mic first so there is transcript context to refresh.");
      }

      if (isRecording && mediaRecorderRef.current?.state === "recording") {
        setIsRefreshing(true);
        const result = await new Promise<{ hadTranscript: boolean }>((resolve) => {
          flushResolverRef.current = resolve;
          nextChunkTriggerRef.current = "manual";
          mediaRecorderRef.current?.requestData();
        });

        if (!result.hadTranscript) {
          await requestSuggestions(transcriptRef.current, "manual");
        }

        return;
      }

      await requestSuggestions(transcriptRef.current, "manual");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Refresh failed.");
      setIsRefreshing(false);
    }
  }

  async function streamAssistantReply(args: {
    prompt: string;
    source: ChatMessageSource;
    suggestionId?: string;
    promptTemplate: string;
    transcriptWindowSize: number;
    reasoningEffort: AppSettings["chatReasoningEffort"];
    temperature: number;
  }) {
    if (!settingsRef.current.apiKey.trim()) {
      throw new Error("Add a Groq API key in Settings before using chat.");
    }

    setIsChatting(true);
    setErrorMessage(null);

    const priorHistory =
      settingsRef.current.chatHistoryTurns > 0
        ? chatMessagesRef.current
            .slice(-settingsRef.current.chatHistoryTurns)
            .filter((message) => message.status !== "error")
            .map((message) => ({
              role: message.role,
              content: message.content,
            }))
        : [];

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: args.prompt,
      createdAt: new Date().toISOString(),
      source: args.source,
      suggestionId: args.suggestionId,
      status: "done",
    };

    appendChatMessage(userMessage);

    const assistantId = crypto.randomUUID();
    appendChatMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      source: args.source,
      suggestionId: args.suggestionId,
      status: "streaming",
    });

    const transcriptWindow = getTranscriptWindow(transcriptRef.current, args.transcriptWindowSize);
    const transcriptContext = [
      args.promptTemplate.trim(),
      "",
      "Transcript context:",
      transcriptWindow.length > 0 ? transcriptToPrompt(transcriptWindow) : "No transcript yet.",
    ].join("\n");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: settingsRef.current.apiKey,
          prompt: args.prompt,
          transcriptContext,
          chatHistory: priorHistory,
          temperature: args.temperature,
          reasoningEffort: args.reasoningEffort,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Chat request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");

        let boundary = buffer.indexOf("\n\n");

        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const delta = parseSseDelta(rawEvent);

          if (delta) {
            accumulated += delta;
            updateChatMessage(assistantId, {
              content: accumulated,
              status: "streaming",
            });
          }

          boundary = buffer.indexOf("\n\n");
        }
      }

      if (buffer.trim()) {
        const delta = parseSseDelta(buffer.trim());

        if (delta) {
          accumulated += delta;
        }
      }

      updateChatMessage(assistantId, {
        content: accumulated.trim(),
        status: "done",
      });
      setIsChatting(false);
    } catch (error) {
      updateChatMessage(assistantId, {
        content: "Unable to retrieve an answer right now.",
        status: "error",
      });
      setIsChatting(false);
      throw error;
    }
  }

  async function handleSuggestionClick(suggestion: Suggestion) {
    try {
      await streamAssistantReply({
        prompt: suggestion.prompt,
        source: "suggestion",
        suggestionId: suggestion.id,
        promptTemplate: settingsRef.current.detailPrompt,
        transcriptWindowSize: settingsRef.current.detailContextChunks,
        reasoningEffort: settingsRef.current.detailReasoningEffort,
        temperature: settingsRef.current.detailTemperature,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Expanded answer failed.");
      setIsChatting(false);
    }
  }

  async function handleChatSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = chatInput.trim();

    if (!prompt) {
      return;
    }

    setChatInput("");

    try {
      await streamAssistantReply({
        prompt,
        source: "typed",
        promptTemplate: settingsRef.current.chatPrompt,
        transcriptWindowSize: settingsRef.current.chatContextChunks,
        reasoningEffort: settingsRef.current.chatReasoningEffort,
        temperature: settingsRef.current.chatTemperature,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Chat failed.");
      setIsChatting(false);
    }
  }

  function exportSession() {
    downloadJsonExport(
      buildSessionExport({
        settings,
        transcript: transcriptChunks,
        suggestionBatches,
        chatHistory: chatMessages,
      }),
    );
  }

  const recordingLabel = isRecording ? "Stop mic" : "Start mic";

  return (
    <main className="page-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div>
          <p className="eyebrow">TwinMind assignment build</p>
          <h1>Live transcript, live suggestions, one continuous copilot chat</h1>
        </div>

        <div className="toolbar">
          <button className="ghost-button" type="button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <button className="ghost-button" type="button" onClick={exportSession}>
            Export session
          </button>
          <button
            className={`primary-button ${isRecording ? "recording" : ""}`}
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
          >
            {recordingLabel}
          </button>
        </div>
      </header>

      <section className="status-strip">
        <span className={`status-pill ${isRecording ? "live" : ""}`}>
          {isRecording ? "Listening" : "Mic idle"}
        </span>
        <span className={`status-pill ${isTranscribing ? "busy" : ""}`}>
          {isTranscribing ? "Transcribing chunk" : "Transcript ready"}
        </span>
        <span className={`status-pill ${isRefreshing ? "busy" : ""}`}>
          {isRefreshing ? "Refreshing suggestions" : "Suggestions standing by"}
        </span>
        <span className={`status-pill ${isChatting ? "busy" : ""}`}>
          {isChatting ? "Streaming chat" : "Chat ready"}
        </span>
        <button
          className="refresh-link"
          type="button"
          disabled={isRefreshing || isTranscribing}
          onClick={handleRefresh}
        >
          Refresh now
        </button>
      </section>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

      <section className="layout-grid">
        <section className="column-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Transcript</p>
              <h2>30-second chunks with auto-scroll</h2>
            </div>
            <span className="panel-meta">{transcriptChunks.length} chunks</span>
          </div>

          <div className="panel-body transcript-list" ref={transcriptViewportRef}>
            {transcriptChunks.length === 0 ? (
              <div className="empty-state">
                Start the mic and the transcript will append here in roughly 30-second chunks.
              </div>
            ) : (
              transcriptChunks.map((chunk) => (
                <article key={chunk.id} className="transcript-card">
                  <div className="transcript-meta">
                    <span>{formatRange(chunk.startedAt, chunk.endedAt)}</span>
                    <span>{chunk.seconds}s</span>
                  </div>
                  <p>{chunk.text}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="column-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Live suggestions</p>
              <h2>Exactly 3 fresh cards per refresh</h2>
            </div>
            <span className="panel-meta">{suggestionBatches.length} batches</span>
          </div>

          <div className="panel-body suggestion-stack">
            {suggestionBatches.length === 0 ? (
              <div className="empty-state">
                Suggestions appear here after the first transcript chunk lands.
              </div>
            ) : (
              suggestionBatches.map((batch) => (
                <section key={batch.id} className="batch-card">
                  <div className="batch-head">
                    <span>{formatClock(batch.createdAt)}</span>
                    <span>{batch.trigger}</span>
                  </div>

                  <div className="suggestion-list">
                    {batch.suggestions.map((suggestion) => (
                      <button
                        className="suggestion-card"
                        key={suggestion.id}
                        type="button"
                        onClick={() => void handleSuggestionClick(suggestion)}
                        disabled={isChatting}
                      >
                        <div className="suggestion-topline">
                          <span className="kind-pill">{KIND_LABELS[suggestion.kind]}</span>
                          <strong>{suggestion.title}</strong>
                        </div>
                        <p>{suggestion.preview}</p>
                        <small>{suggestion.whyNow}</small>
                      </button>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </section>

        <section className="column-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Copilot chat</p>
              <h2>Click cards or type directly</h2>
            </div>
            <span className="panel-meta">{chatMessages.length} messages</span>
          </div>

          <div className="panel-body chat-thread" ref={chatViewportRef}>
            {chatMessages.length === 0 ? (
              <div className="empty-state">
                Click a suggestion card or ask your own question here. The chat stays continuous for the session.
              </div>
            ) : (
              chatMessages.map((message) => (
                <article
                  key={message.id}
                  className={`chat-bubble ${message.role === "assistant" ? "assistant" : "user"}`}
                >
                  <div className="chat-meta">
                    <span>{message.role === "assistant" ? "Copilot" : "You"}</span>
                    <span>{formatClock(message.createdAt)}</span>
                  </div>
                  <div className="chat-content">{renderMarkdownish(message.content)}</div>
                </article>
              ))
            )}
          </div>

          <form className="chat-form" onSubmit={handleChatSubmit}>
            <textarea
              rows={4}
              value={chatInput}
              placeholder="Ask a direct question about the conversation..."
              onChange={(event) => setChatInput(event.target.value)}
            />
            <button className="primary-button" type="submit" disabled={isChatting}>
              Send
            </button>
          </form>
        </section>
      </section>

      <SettingsPanel
        isOpen={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onChange={updateSetting}
      />
    </main>
  );
}
