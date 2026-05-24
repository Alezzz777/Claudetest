import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { visionJSON } from "@/lib/claude";
import { TIE_ANALYZE_SYSTEM, TIE_ANALYZE_USER } from "@/lib/prompts";
import { parseDataUrl } from "@/lib/image";

type Analyzed = {
  name: string;
  brand: string | null;
  pattern: string;
  colors: string[];
  material: string | null;
  widthCm: number | null;
  lengthCm: number | null;
  estPriceMin: number | null;
  estPriceMax: number | null;
  currency: "USD" | "EUR" | "RUB";
  condition: string | null;
  notes: string;
  summary: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const photo: string = body.photo;
  if (!photo) return NextResponse.json({ error: "photo is required" }, { status: 400 });
  const parsed = parseDataUrl(photo);

  const analyzed = await visionJSON<Analyzed>({
    system: TIE_ANALYZE_SYSTEM,
    user: TIE_ANALYZE_USER,
    images: [{ mime: parsed.mime, base64: parsed.base64 }],
  });

  let matched: { id: string; name: string } | null = null;
  if (analyzed?.colors?.length || analyzed?.pattern) {
    const candidates = await prisma.tie.findMany({
      where: {
        OR: [
          analyzed.brand ? { brand: { equals: analyzed.brand, mode: "insensitive" } } : undefined,
          analyzed.pattern ? { pattern: { equals: analyzed.pattern, mode: "insensitive" } } : undefined,
        ].filter(Boolean) as never,
      },
      take: 20,
    });
    const colorsSet = new Set((analyzed.colors ?? []).map((c) => c.toLowerCase()));
    let best: { id: string; name: string; score: number } | null = null;
    for (const t of candidates) {
      let score = 0;
      if (analyzed.brand && t.brand && t.brand.toLowerCase() === analyzed.brand.toLowerCase()) score += 3;
      if (analyzed.pattern && t.pattern && t.pattern.toLowerCase() === analyzed.pattern.toLowerCase()) score += 2;
      for (const c of t.colors) if (colorsSet.has(c.toLowerCase())) score += 1;
      if (!best || score > best.score) best = { id: t.id, name: t.name, score };
    }
    if (best && best.score >= 4) matched = { id: best.id, name: best.name };
  }

  return NextResponse.json({ analyzed, matched });
}
