import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseDataUrl } from "@/lib/image";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { brand: { contains: q, mode: "insensitive" as const } },
          { pattern: { contains: q, mode: "insensitive" as const } },
          { notes: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : undefined;
  const ties = await prisma.tie.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { photos: { select: { id: true, isPrimary: true }, take: 1, orderBy: { isPrimary: "desc" } } },
  });
  return NextResponse.json({ ties });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const photoDataUrl: string | undefined = body.photo;
  const data = {
    name: String(body.name ?? "Без названия"),
    brand: body.brand ?? null,
    pattern: body.pattern ?? null,
    colors: Array.isArray(body.colors) ? body.colors.map(String) : [],
    material: body.material ?? null,
    widthCm: body.widthCm != null ? Number(body.widthCm) : null,
    lengthCm: body.lengthCm != null ? Number(body.lengthCm) : null,
    estPriceMin: body.estPriceMin != null ? Math.round(Number(body.estPriceMin)) : null,
    estPriceMax: body.estPriceMax != null ? Math.round(Number(body.estPriceMax)) : null,
    currency: body.currency ?? "USD",
    condition: body.condition ?? null,
    notes: body.notes ?? null,
    aiSummary: body.aiSummary ?? body.summary ?? null,
  };
  const tie = await prisma.tie.create({ data });
  if (photoDataUrl) {
    const parsed = parseDataUrl(photoDataUrl);
    await prisma.photo.create({
      data: { tieId: tie.id, mime: parsed.mime, data: parsed.bytes, isPrimary: true },
    });
  }
  return NextResponse.json({ id: tie.id });
}
