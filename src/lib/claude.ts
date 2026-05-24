import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey && process.env.NODE_ENV === "production") {
  console.warn("ANTHROPIC_API_KEY is not set");
}

export const anthropic = new Anthropic({ apiKey: apiKey ?? "missing" });
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

export type VisionImage = { mime: string; base64: string };

export function imageBlock(img: VisionImage) {
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      data: img.base64,
    },
  };
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  let s = -1;
  if (start === -1) s = startArr;
  else if (startArr === -1) s = start;
  else s = Math.min(start, startArr);
  if (s === -1) throw new Error("No JSON in model response");
  const opening = candidate[s];
  const closing = opening === "{" ? "}" : "]";
  const e = candidate.lastIndexOf(closing);
  if (e === -1) throw new Error("Unterminated JSON in model response");
  return JSON.parse(candidate.slice(s, e + 1));
}

export async function visionJSON<T>(opts: {
  system: string;
  user: string;
  images: VisionImage[];
  maxTokens?: number;
}): Promise<T> {
  const res = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 2000,
    system: opts.system,
    messages: [
      {
        role: "user",
        content: [
          ...opts.images.map(imageBlock),
          { type: "text", text: opts.user },
        ],
      },
    ],
  });
  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Empty response from Claude");
  }
  return extractJson(textBlock.text) as T;
}
