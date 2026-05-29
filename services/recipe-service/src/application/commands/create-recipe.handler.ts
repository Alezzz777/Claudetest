import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ConflictException, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RecipeAggregate } from '../../domain/recipe.aggregate';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { CreateRecipeCommand } from './create-recipe.command';

@CommandHandler(CreateRecipeCommand)
export class CreateRecipeHandler implements ICommandHandler<CreateRecipeCommand, string> {
  private readonly logger = new Logger(CreateRecipeHandler.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly eventStore: EventStoreRepository,
  ) {}

  async execute(cmd: CreateRecipeCommand): Promise<string> {
    // Idempotency: check if recipe with this productCode already exists
    const existing = await this.prisma.recipeProjection.findUnique({
      where: { productCode: cmd.productCode },
    });
    if (existing) {
      this.logger.warn(`Recipe with productCode ${cmd.productCode} already exists: ${existing.recipeId}`);
      throw new ConflictException(`Recipe with productCode '${cmd.productCode}' already exists`);
    }

    const recipe = RecipeAggregate.create({
      productCode: cmd.productCode,
      description: cmd.description,
      correlationId: cmd.correlationId,
    });

    const events = recipe.popUncommittedEvents();
    await this.eventStore.save(recipe.getId(), events, 0);

    this.logger.log(`Recipe created: ${recipe.getId()} (${cmd.productCode})`);
    return recipe.getId();
  }
}
