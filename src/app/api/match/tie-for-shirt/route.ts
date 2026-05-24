import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { visionJSON } from "@/lib/claude";
import { TIE_FOR_SHIRT_SYSTEM, TIE_FOR_SHIRT_USER } from "@/lib/prompts";
import { parseDataUrl } from "@/lib/image";

type Result = {
  shirt: { color: string; pattern: string; formality: string; hex: string };
  fromCollection: Array<{ id: string; reasoning: string }>;
  generic: Array<{ color: string; hex: string; pattern: string; reasoning: string }>;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const photo: string = body.photo;
  if (!photo) return NextResponse.json({ error: "photo required" }, { status: 400 });
  const parsed = parseDataUrl(photo);

  const ties = await prisma.tie.findMany({
    select: { id: true, name: true, pattern: true, colors: true, brand: true },
    take: 100,
  });
  const haveTies = ties
    .map((t) => `- ${t.id}: ${t.name} | ${t.pattern ?? "?"} | colors: ${t.colors.join(", ")}`)
    .join("\n");

  const result = await visionJSON<Result>({
    system: TIE_FOR_SHIRT_SYSTEM,
    user: TIE_FOR_SHIRT_USER(haveTies),
    images: [{ mime: parsed.mime, base64: parsed.base64 }],
  });

  const idSet = new Set(ties.map((t) => t.id));
  const enriched = {
    ...result,
    fromCollection: (result.fromCollection ?? [])
      .filter((r) => idSet.has(r.id))
      .map((r) => {
        const t = ties.find((x) => x.id === r.id)!;
        return { ...r, name: t.name, pattern: t.pattern, colors: t.colors };
      }),
  };
  return NextResponse.json(enriched);
}
