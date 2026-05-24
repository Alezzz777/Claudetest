import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { visionJSON } from "@/lib/claude";
import { SHIRT_FOR_TIE_SYSTEM, SHIRT_FOR_TIE_USER } from "@/lib/prompts";

type Result = {
  recommendations: Array<{
    occasion: string;
    shirtColor: string;
    hex: string;
    pattern: string;
    reasoning: string;
  }>;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const tieId: string = body.tieId;
  if (!tieId) return NextResponse.json({ error: "tieId required" }, { status: 400 });
  const photo = await prisma.photo.findFirst({
    where: { tieId },
    orderBy: { isPrimary: "desc" },
  });
  if (!photo) return NextResponse.json({ error: "no photo for tie" }, { status: 404 });

  const result = await visionJSON<Result>({
    system: SHIRT_FOR_TIE_SYSTEM,
    user: SHIRT_FOR_TIE_USER,
    images: [{ mime: photo.mime, base64: Buffer.from(photo.data).toString("base64") }],
  });
  return NextResponse.json(result);
}
