export class ObsoleteRecipeCommand {
  constructor(
    public readonly recipeId: string,
    public readonly obsoletedBy: string,
    public readonly correlationId: string,
  ) {}
}
