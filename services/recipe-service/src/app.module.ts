import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaClient } from '@prisma/client';

// Infrastructure
import { EventStoreRepository } from './infrastructure/persistence/event-store.repository';
import { KafkaProducerService } from './infrastructure/messaging/kafka-producer.service';
import { OutboxRelayService } from './infrastructure/messaging/outbox-relay.service';
import { KafkaConsumerService } from './infrastructure/messaging/kafka-consumer.service';
import { RecipeCacheService } from './infrastructure/cache/recipe-cache.service';

// Command handlers
import { CreateRecipeHandler } from './application/commands/create-recipe.handler';
import { PublishRecipeVersionHandler } from './application/commands/publish-recipe-version.handler';
import { ObsoleteRecipeHandler } from './application/commands/obsolete-recipe.handler';

// Query handlers
import { GetRecipeHandler } from './application/queries/get-recipe.handler';
import { ListRecipesHandler } from './application/queries/list-recipes.handler';
import { GetRecipeVersionHandler } from './application/queries/get-recipe-version.handler';

// Event handlers
import { RecipeProjectionHandler } from './application/events/recipe-projection.handler';

// API
import { RecipeController } from './api/recipe.controller';

const CommandHandlers = [CreateRecipeHandler, PublishRecipeVersionHandler, ObsoleteRecipeHandler];
const QueryHandlers = [GetRecipeHandler, ListRecipesHandler, GetRecipeVersionHandler];

@Module({
  imports: [CqrsModule],
  controllers: [RecipeController],
  providers: [
    // PrismaClient provided as factory
    {
      provide: 'PRISMA_CLIENT',
      useFactory: () => {
        const client = new PrismaClient();
        void client.$connect();
        return client;
      },
    },
    EventStoreRepository,
    KafkaProducerService,
    OutboxRelayService,
    KafkaConsumerService,
    RecipeCacheService,
    RecipeProjectionHandler,
    ...CommandHandlers,
    ...QueryHandlers,
  ],
})
export class AppModule {}
