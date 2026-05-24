import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photo = await prisma.photo.findFirst({
    where: { tieId: id },
    orderBy: { isPrimary: "desc" },
  });
  if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
