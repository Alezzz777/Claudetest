import { NextRequest, NextResponse } from "next/server";
import { visionJSON } from "@/lib/claude";
import { BATCH_SYSTEM, BATCH_USER } from "@/lib/prompts";
import { parseDataUrl } from "@/lib/image";

type BatchResult = {
  ties: Array<{
    index: number;
    location: string;
    candidates: Array<{ name: string; confidence: number }>;
    pattern: string;
    colors: string[];
    notes: string;
  }>;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const photo: string = body.photo;
  if (!photo) return NextResponse.json({ error: "photo is required" }, { status: 400 });
  const parsed = parseDataUrl(photo);
  const result = await visionJSON<BatchResult>({
    system: BATCH_SYSTEM,
    user: BATCH_USER,
    images: [{ mime: parsed.mime, base64: parsed.base64 }],
    maxTokens: 3000,
  });
  return NextResponse.json(result);
}
