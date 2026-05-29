import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException } from '@nestjs/common';
import { RecipeAggregate } from '../../domain/recipe.aggregate';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { ObsoleteRecipeCommand } from './obsolete-recipe.command';

@CommandHandler(ObsoleteRecipeCommand)
export class ObsoleteRecipeHandler implements ICommandHandler<ObsoleteRecipeCommand, void> {
  private readonly logger = new Logger(ObsoleteRecipeHandler.name);

  constructor(private readonly eventStore: EventStoreRepository) {}

  async execute(cmd: ObsoleteRecipeCommand): Promise<void> {
    const history = await this.eventStore.load(cmd.recipeId);
    if (history.length === 0) throw new NotFoundException(`Recipe ${cmd.recipeId} not found`);

    const recipe = RecipeAggregate.rehydrate(RecipeAggregate, history);
    const expectedVersion = recipe.getVersion();

    recipe.obsolete(cmd.obsoletedBy, cmd.correlationId);

    const events = recipe.popUncommittedEvents();
    if (events.length === 0) {
      // Already obsolete — idempotent, nothing to save
      return;
    }

    await this.eventStore.save(cmd.recipeId, events, expectedVersion);
    this.logger.log(`Recipe ${cmd.recipeId} obsoleted by ${cmd.obsoletedBy}`);
  }
}
