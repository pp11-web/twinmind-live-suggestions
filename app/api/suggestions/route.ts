import { createStructuredCompletion } from "@/lib/groq";
import type { RefreshTrigger } from "@/lib/types";

export const runtime = "nodejs";

type SuggestionsRequest = {
  apiKey: string;
  liveSuggestionPrompt: string;
  transcriptContext: string;
  priorSuggestions: string[];
  previewCharLimit: number;
  trigger: RefreshTrigger;
  temperature: number;
  reasoningEffort: "low" | "medium" | "high";
};

const suggestionSchema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["answer", "next_question", "talking_point", "clarification", "fact_check"],
          },
          title: { type: "string" },
          preview: { type: "string" },
          prompt: { type: "string" },
          whyNow: { type: "string" },
        },
        required: ["kind", "title", "preview", "prompt", "whyNow"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SuggestionsRequest;

    if (!body.transcriptContext.trim()) {
      return Response.json({ error: "Transcript context is required." }, { status: 400 });
    }

    const prompt = [
      body.liveSuggestionPrompt.trim(),
      "",
      `Trigger: ${body.trigger}`,
      `Preview character limit: ${body.previewCharLimit}`,
      "",
      "Recent transcript context:",
      body.transcriptContext,
      "",
      "Recent suggestion previews to avoid repeating:",
      body.priorSuggestions.length > 0 ? body.priorSuggestions.map((item) => `- ${item}`).join("\n") : "- none",
      "",
      "Return the freshest 3 suggestions for right now.",
    ].join("\n");

    const result = await createStructuredCompletion({
      apiKey: body.apiKey,
      prompt,
      schemaName: "live_suggestion_batch",
      schema: suggestionSchema,
      temperature: body.temperature,
      reasoningEffort: body.reasoningEffort,
      maxCompletionTokens: 900,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Suggestion generation failed." },
      { status: 500 },
    );
  }
}
