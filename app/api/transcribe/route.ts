import { GROQ_MODELS } from "@/lib/defaults";
import { readGroqError, requireApiKey } from "@/lib/groq";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const apiKey = String(formData.get("apiKey") ?? "");
    const file = formData.get("file");
    const language = String(formData.get("language") ?? "en");
    const prompt = String(formData.get("prompt") ?? "");

    requireApiKey(apiKey);

    if (!(file instanceof File)) {
      return Response.json({ error: "Audio file is required." }, { status: 400 });
    }

    const upstreamForm = new FormData();
    upstreamForm.append("file", file, file.name || "audio.webm");
    upstreamForm.append("model", GROQ_MODELS.transcription);
    upstreamForm.append("response_format", "verbose_json");
    upstreamForm.append("temperature", "0");

    if (language.trim()) {
      upstreamForm.append("language", language.trim());
    }

    if (prompt.trim()) {
      upstreamForm.append("prompt", prompt.trim());
    }

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: upstreamForm,
    });

    if (!response.ok) {
      return Response.json(
        { error: await readGroqError(response) },
        { status: response.status },
      );
    }

    const result = (await response.json()) as {
      text?: string;
      language?: string;
      duration?: number;
    };

    return Response.json({
      text: result.text ?? "",
      language: result.language,
      duration: result.duration,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Transcription failed." },
      { status: 500 },
    );
  }
}
