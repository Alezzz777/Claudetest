import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { PublishRecipeVersionHandler } from './application/commands/publish-recipe-version.handler';
import { GetRecipeHandler } from './application/queries/get-recipe.handler';
import { RecipePublishedHandler } from './application/events/recipe-published.handler';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { RecipeController } from './api/recipe.controller';

@Module({
  imports: [CqrsModule, ScheduleModule.forRoot(), PersistenceModule, MessagingModule],
  controllers: [RecipeController],
  providers: [PublishRecipeVersionHandler, GetRecipeHandler, RecipePublishedHandler],
})
export class AppModule {}
