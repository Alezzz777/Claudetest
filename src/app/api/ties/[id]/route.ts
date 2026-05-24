import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tie = await prisma.tie.findUnique({
    where: { id },
    include: { photos: { select: { id: true, isPrimary: true, createdAt: true } } },
  });
  if (!tie) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ tie });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const allowed = [
    "name", "brand", "pattern", "colors", "material",
    "widthCm", "lengthCm", "estPriceMin", "estPriceMax",
    "currency", "condition", "notes", "aiSummary",
  ] as const;
  const data: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) data[k] = body[k];
  const tie = await prisma.tie.update({ where: { id }, data });
  return NextResponse.json({ tie });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.tie.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
