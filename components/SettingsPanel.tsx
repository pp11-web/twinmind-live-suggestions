"use client";

import { GROQ_MODELS } from "@/lib/defaults";
import type { AppSettings } from "@/lib/types";

type SettingsPanelProps = {
  isOpen: boolean;
  settings: AppSettings;
  onClose: () => void;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
};

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function SettingsPanel({ isOpen, settings, onClose, onChange }: SettingsPanelProps) {
  return (
    <aside className={`settings-drawer ${isOpen ? "open" : ""}`} aria-hidden={!isOpen}>
      <div className="settings-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Groq key, prompts, and context windows</h2>
        </div>
        <button className="ghost-button" onClick={onClose} type="button">
          Close
        </button>
      </div>

      <div className="settings-grid">
        <label className="field">
          <span>Groq API key</span>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(event) => onChange("apiKey", event.target.value)}
            placeholder="gsk_..."
            autoComplete="off"
          />
          <small>Stored only in this browser.</small>
        </label>

        <div className="readonly-grid">
          <label className="field">
            <span>Transcription model</span>
            <input type="text" value={GROQ_MODELS.transcription} readOnly />
          </label>
          <label className="field">
            <span>Suggestions/chat model</span>
            <input type="text" value={GROQ_MODELS.reasoning} readOnly />
          </label>
        </div>

        <label className="field">
          <span>Live suggestion prompt</span>
          <textarea
            rows={9}
            value={settings.liveSuggestionPrompt}
            onChange={(event) => onChange("liveSuggestionPrompt", event.target.value)}
          />
        </label>

        <label className="field">
          <span>Expanded answer prompt</span>
          <textarea
            rows={8}
            value={settings.detailPrompt}
            onChange={(event) => onChange("detailPrompt", event.target.value)}
          />
        </label>

        <label className="field">
          <span>Chat prompt</span>
          <textarea
            rows={7}
            value={settings.chatPrompt}
            onChange={(event) => onChange("chatPrompt", event.target.value)}
          />
        </label>

        <div className="readonly-grid">
          <NumberField
            label="Chunk seconds"
            value={settings.chunkSeconds}
            onChange={(value) => onChange("chunkSeconds", Math.min(60, Math.max(10, value)))}
            min={10}
            max={60}
          />
          <NumberField
            label="Suggestion transcript chunks"
            value={settings.suggestionContextChunks}
            onChange={(value) =>
              onChange("suggestionContextChunks", Math.min(20, Math.max(1, value)))
            }
            min={1}
            max={20}
          />
          <NumberField
            label="Expanded answer transcript chunks"
            value={settings.detailContextChunks}
            onChange={(value) => onChange("detailContextChunks", Math.min(40, Math.max(1, value)))}
            min={1}
            max={40}
          />
          <NumberField
            label="Chat transcript chunks"
            value={settings.chatContextChunks}
            onChange={(value) => onChange("chatContextChunks", Math.min(40, Math.max(1, value)))}
            min={1}
            max={40}
          />
          <NumberField
            label="Chat history turns"
            value={settings.chatHistoryTurns}
            onChange={(value) => onChange("chatHistoryTurns", Math.min(20, Math.max(0, value)))}
            min={0}
            max={20}
          />
          <NumberField
            label="Preview character limit"
            value={settings.previewCharLimit}
            onChange={(value) => onChange("previewCharLimit", Math.min(240, Math.max(80, value)))}
            min={80}
            max={240}
          />
          <NumberField
            label="Suggestion temperature"
            value={settings.suggestionTemperature}
            onChange={(value) =>
              onChange("suggestionTemperature", Math.min(1, Math.max(0, value)))
            }
            min={0}
            max={1}
            step={0.05}
          />
          <NumberField
            label="Expanded answer temperature"
            value={settings.detailTemperature}
            onChange={(value) => onChange("detailTemperature", Math.min(1, Math.max(0, value)))}
            min={0}
            max={1}
            step={0.05}
          />
          <NumberField
            label="Chat temperature"
            value={settings.chatTemperature}
            onChange={(value) => onChange("chatTemperature", Math.min(1, Math.max(0, value)))}
            min={0}
            max={1}
            step={0.05}
          />
        </div>

        <div className="readonly-grid">
          <label className="field">
            <span>Transcript language</span>
            <input
              type="text"
              value={settings.transcriptLanguage}
              onChange={(event) => onChange("transcriptLanguage", event.target.value)}
              placeholder="en"
            />
          </label>
          <label className="field">
            <span>Transcription hint</span>
            <input
              type="text"
              value={settings.transcriptionHint}
              onChange={(event) => onChange("transcriptionHint", event.target.value)}
            />
          </label>
          <label className="field">
            <span>Suggestion reasoning effort</span>
            <select
              value={settings.suggestionReasoningEffort}
              onChange={(event) =>
                onChange(
                  "suggestionReasoningEffort",
                  event.target.value as AppSettings["suggestionReasoningEffort"],
                )
              }
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label className="field">
            <span>Expanded answer reasoning effort</span>
            <select
              value={settings.detailReasoningEffort}
              onChange={(event) =>
                onChange(
                  "detailReasoningEffort",
                  event.target.value as AppSettings["detailReasoningEffort"],
                )
              }
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label className="field">
            <span>Chat reasoning effort</span>
            <select
              value={settings.chatReasoningEffort}
              onChange={(event) =>
                onChange("chatReasoningEffort", event.target.value as AppSettings["chatReasoningEffort"])
              }
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
        </div>
      </div>
    </aside>
  );
}
