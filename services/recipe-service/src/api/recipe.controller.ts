import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsString, IsArray, IsUUID, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard, Roles } from './guards/roles.guard';
import { CreateRecipeCommand } from '../application/commands/create-recipe.command';
import { PublishRecipeVersionCommand } from '../application/commands/publish-recipe-version.command';
import { ObsoleteRecipeCommand } from '../application/commands/obsolete-recipe.command';
import { GetRecipeQuery, RecipeReadModel } from '../application/queries/get-recipe.handler';
import { ListRecipesQuery, ListRecipesResult } from '../application/queries/list-recipes.handler';
import { GetRecipeVersionQuery, RecipeVersionReadModel } from '../application/queries/get-recipe-version.handler';
import type { RecipeStep } from '../domain/recipe.aggregate';

class CreateRecipeDto {
  @IsString() productCode!: string;
  @IsString() description!: string;
  @IsUUID() correlationId!: string;
}

class PublishVersionDto {
  @IsString() version!: string;
  @IsArray() steps!: RecipeStep[];
  @IsString() publishedBy!: string;
  @IsUUID() correlationId!: string;
}

class ObsoleteDto {
  @IsString() obsoletedBy!: string;
  @IsUUID() correlationId!: string;
}

@ApiTags('recipes')
@ApiBearerAuth()
@Controller('recipes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecipeController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'ENGINEER')
  @ApiOperation({ summary: 'Create a new recipe' })
  async createRecipe(@Body() dto: CreateRecipeDto): Promise<{ recipeId: string }> {
    const recipeId = await this.commandBus.execute<CreateRecipeCommand, string>(
      new CreateRecipeCommand(dto.productCode, dto.description, dto.correlationId),
    );
    return { recipeId };
  }

  @Get()
  @ApiOperation({ summary: 'List recipes with optional status filter' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  async listRecipes(
    @Query('status') status?: string,
    @Query('page') @Type(() => Number) @IsNumber() @Min(1) @IsOptional() page = 1,
    @Query('pageSize') @Type(() => Number) @IsNumber() @Min(1) @IsOptional() pageSize = 20,
  ): Promise<ListRecipesResult> {
    return this.queryBus.execute(new ListRecipesQuery(Number(page), Number(pageSize), status));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get recipe by ID' })
  async getRecipe(@Param('id') id: string): Promise<RecipeReadModel> {
    return this.queryBus.execute(new GetRecipeQuery(id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('ADMIN', 'ENGINEER')
  @ApiOperation({ summary: 'Obsolete a recipe (soft delete)' })
  async obsoleteRecipe(@Param('id') id: string, @Body() dto: ObsoleteDto): Promise<void> {
    await this.commandBus.execute(new ObsoleteRecipeCommand(id, dto.obsoletedBy, dto.correlationId));
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'ENGINEER')
  @ApiOperation({ summary: 'Publish a new recipe version' })
  async publishVersion(@Param('id') id: string, @Body() dto: PublishVersionDto): Promise<void> {
    await this.commandBus.execute(
      new PublishRecipeVersionCommand(id, dto.version, dto.steps, dto.publishedBy, dto.correlationId),
    );
  }

  @Get(':id/versions/:version')
  @ApiOperation({ summary: 'Get a specific recipe version with steps' })
  async getRecipeVersion(
    @Param('id') id: string,
    @Param('version') version: string,
  ): Promise<RecipeVersionReadModel> {
    return this.queryBus.execute(new GetRecipeVersionQuery(id, version));
  }
}
