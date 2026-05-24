-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Tie" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "pattern" TEXT,
    "colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "material" TEXT,
    "widthCm" DOUBLE PRECISION,
    "lengthCm" DOUBLE PRECISION,
    "estPriceMin" INTEGER,
    "estPriceMax" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "condition" TEXT,
    "notes" TEXT,
    "aiSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "tieId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tie_brand_idx" ON "Tie"("brand");

-- CreateIndex
CREATE INDEX "Tie_pattern_idx" ON "Tie"("pattern");

-- CreateIndex
CREATE INDEX "Photo_tieId_idx" ON "Photo"("tieId");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_tieId_fkey" FOREIGN KEY ("tieId") REFERENCES "Tie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

