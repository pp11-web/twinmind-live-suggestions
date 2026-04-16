import { GROQ_MODELS } from "@/lib/defaults";

export type GroqMessage = {
  role: "user" | "assistant";
  content: string;
};

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export function requireApiKey(apiKey: string) {
  if (!apiKey.trim()) {
    throw new Error("Add a Groq API key in Settings before using the app.");
  }
}

export async function readGroqError(response: Response) {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string };
    };

    return parsed.error?.message ?? text;
  } catch {
    return text;
  }
}

export async function createStructuredCompletion(args: {
  apiKey: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  temperature: number;
  reasoningEffort: "low" | "medium" | "high";
  maxCompletionTokens: number;
}) {
  requireApiKey(args.apiKey);

  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODELS.reasoning,
      messages: [
        {
          role: "user",
          content: args.prompt,
        },
      ],
      temperature: args.temperature,
      top_p: 0.95,
      max_completion_tokens: args.maxCompletionTokens,
      reasoning_effort: args.reasoningEffort,
      reasoning_format: "hidden",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: args.schemaName,
          strict: true,
          schema: args.schema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await readGroqError(response));
  }

  const completion = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = completion.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq returned an empty response.");
  }

  return JSON.parse(content) as Record<string, unknown>;
}

export async function createTextStream(args: {
  apiKey: string;
  instruction: string;
  history: GroqMessage[];
  latestUserMessage: string;
  temperature: number;
  reasoningEffort: "low" | "medium" | "high";
  maxCompletionTokens: number;
}) {
  requireApiKey(args.apiKey);

  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODELS.reasoning,
      stream: true,
      messages: [
        {
          role: "user",
          content: args.instruction,
        },
        ...args.history,
        {
          role: "user",
          content: args.latestUserMessage,
        },
      ],
      temperature: args.temperature,
      top_p: 0.95,
      max_completion_tokens: args.maxCompletionTokens,
      reasoning_effort: args.reasoningEffort,
      reasoning_format: "hidden",
    }),
  });

  if (!response.ok) {
    throw new Error(await readGroqError(response));
  }

  return response;
}
