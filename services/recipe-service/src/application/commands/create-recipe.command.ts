export class CreateRecipeCommand {
  constructor(
    public readonly productCode: string,
    public readonly description: string,
    public readonly correlationId: string,
  ) {}
}
