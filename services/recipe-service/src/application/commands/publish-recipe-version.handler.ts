import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException } from '@nestjs/common';
import { RecipeAggregate } from '../../domain/recipe.aggregate';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { PublishRecipeVersionCommand } from './publish-recipe-version.command';

@CommandHandler(PublishRecipeVersionCommand)
export class PublishRecipeVersionHandler implements ICommandHandler<PublishRecipeVersionCommand, void> {
  private readonly logger = new Logger(PublishRecipeVersionHandler.name);

  constructor(private readonly eventStore: EventStoreRepository) {}

  async execute(cmd: PublishRecipeVersionCommand): Promise<void> {
    const history = await this.eventStore.load(cmd.recipeId);
    if (history.length === 0) throw new NotFoundException(`Recipe ${cmd.recipeId} not found`);

    const recipe = RecipeAggregate.rehydrate(RecipeAggregate, history);
    const expectedVersion = recipe.getVersion();

    recipe.publishVersion({
      version: cmd.version,
      steps: cmd.steps,
      publishedBy: cmd.publishedBy,
      correlationId: cmd.correlationId,
    });

    const events = recipe.popUncommittedEvents();
    await this.eventStore.save(cmd.recipeId, events, expectedVersion);

    this.logger.log(`Recipe ${cmd.recipeId} version ${cmd.version} published`);
  }
}
