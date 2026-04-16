import { createTextStream } from "@/lib/groq";
import type { GroqMessage } from "@/lib/groq";

export const runtime = "nodejs";

type ChatRequest = {
  apiKey: string;
  prompt: string;
  transcriptContext: string;
  chatHistory: GroqMessage[];
  temperature: number;
  reasoningEffort: "low" | "medium" | "high";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;

    if (!body.prompt.trim()) {
      return Response.json({ error: "Prompt is required." }, { status: 400 });
    }

    const instruction = [
      body.transcriptContext.trim(),
      "",
      "Answer the next user message using the transcript context above.",
    ]
      .filter(Boolean)
      .join("\n");

    const upstream = await createTextStream({
      apiKey: body.apiKey,
      instruction,
      history: body.chatHistory,
      latestUserMessage: body.prompt,
      temperature: body.temperature,
      reasoningEffort: body.reasoningEffort,
      maxCompletionTokens: 1800,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Chat failed." },
      { status: 500 },
    );
  }
}
