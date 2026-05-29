import type { RecipeStep } from '../../domain/recipe.aggregate';

export class PublishRecipeVersionCommand {
  constructor(
    public readonly recipeId: string,
    public readonly version: string,
    public readonly steps: RecipeStep[],
    public readonly publishedBy: string,
    public readonly correlationId: string,
  ) {}
}
