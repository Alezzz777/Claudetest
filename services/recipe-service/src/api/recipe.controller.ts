import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsArray, IsUUID } from 'class-validator';
import { PublishRecipeVersionCommand } from '../application/commands/publish-recipe-version.handler';
import { GetRecipeQuery, RecipeReadModel } from '../application/queries/get-recipe.handler';
import type { RecipeStep } from '../domain/recipe.aggregate';

class PublishVersionDto {
  @IsString() version!: string;
  @IsArray() steps!: RecipeStep[];
  @IsString() publishedBy!: string;
  @IsUUID() correlationId!: string;
}

@ApiTags('recipes')
@ApiBearerAuth()
@Controller('recipes')
export class RecipeController {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}

  @Get(':recipeId')
  @ApiOperation({ summary: 'Get recipe with current version' })
  async getRecipe(@Param('recipeId') recipeId: string): Promise<RecipeReadModel> {
    return this.queryBus.execute(new GetRecipeQuery(recipeId));
  }

  @Post(':recipeId/versions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Publish a new recipe version' })
  async publishVersion(@Param('recipeId') recipeId: string, @Body() dto: PublishVersionDto): Promise<void> {
    await this.commandBus.execute(new PublishRecipeVersionCommand(recipeId, dto.version, dto.steps, dto.publishedBy, dto.correlationId));
  }
}
