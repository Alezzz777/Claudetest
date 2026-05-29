import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEnvelope } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import type { RecipeVersionPublishedPayload } from '../../domain/recipe.aggregate';

@Injectable()
export class RecipePublishedHandler {
  private readonly logger = new Logger(RecipePublishedHandler.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope<RecipeVersionPublishedPayload>): Promise<void> {
    const { id: eventId, data } = envelope;
    const already = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    if (already) return;
    await this.prisma.$transaction([
      this.prisma.recipeProjection.upsert({
        where: { recipeId: data.recipeId },
        update: { currentVersion: data.version, steps: data.steps as unknown as any, status: 'APPROVED', updatedAt: new Date() },
        create: { recipeId: data.recipeId, productCode: data.productCode, currentVersion: data.version, steps: data.steps as unknown as any, status: 'APPROVED' },
      }),
      this.prisma.processedEvent.create({ data: { eventId, processedAt: new Date() } }),
    ]);
    this.logger.debug(`Recipe projection updated: ${data.recipeId} v${data.version}`);
  }
}
