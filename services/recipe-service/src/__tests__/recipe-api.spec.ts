import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecipeController } from '../api/recipe.controller';
import { CreateRecipeCommand } from '../application/commands/create-recipe.command';
import { PublishRecipeVersionCommand } from '../application/commands/publish-recipe-version.command';
import { ObsoleteRecipeCommand } from '../application/commands/obsolete-recipe.command';
import { GetRecipeQuery } from '../application/queries/get-recipe.handler';
import { ListRecipesQuery } from '../application/queries/list-recipes.handler';
import { GetRecipeVersionQuery } from '../application/queries/get-recipe-version.handler';

function makeCommandBus() {
  return { execute: vi.fn() };
}

function makeQueryBus() {
  return { execute: vi.fn() };
}

describe('RecipeController', () => {
  let controller: RecipeController;
  let commandBus: ReturnType<typeof makeCommandBus>;
  let queryBus: ReturnType<typeof makeQueryBus>;

  beforeEach(() => {
    commandBus = makeCommandBus();
    queryBus = makeQueryBus();
    controller = new RecipeController(commandBus as any, queryBus as any);
  });

  it('POST /recipes → dispatches CreateRecipeCommand', async () => {
    commandBus.execute.mockResolvedValue('recipe-id-123');
    const dto = { productCode: 'PC-001', description: 'Test', correlationId: '00000000-0000-0000-0000-000000000001' };
    const result = await controller.createRecipe(dto);

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreateRecipeCommand));
    const cmd = commandBus.execute.mock.calls[0]![0] as CreateRecipeCommand;
    expect(cmd.productCode).toBe('PC-001');
    expect(cmd.description).toBe('Test');
    expect(result).toEqual({ recipeId: 'recipe-id-123' });
  });

  it('GET /recipes → dispatches ListRecipesQuery', async () => {
    queryBus.execute.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    await controller.listRecipes('APPROVED', 1, 20);

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ListRecipesQuery));
    const q = queryBus.execute.mock.calls[0]![0] as ListRecipesQuery;
    expect(q.status).toBe('APPROVED');
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(20);
  });

  it('GET /recipes/:id → dispatches GetRecipeQuery', async () => {
    queryBus.execute.mockResolvedValue({ recipeId: 'r-001' });
    await controller.getRecipe('r-001');

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetRecipeQuery));
    const q = queryBus.execute.mock.calls[0]![0] as GetRecipeQuery;
    expect(q.recipeId).toBe('r-001');
  });

  it('DELETE /recipes/:id → dispatches ObsoleteRecipeCommand', async () => {
    commandBus.execute.mockResolvedValue(undefined);
    const dto = { obsoletedBy: 'admin', correlationId: '00000000-0000-0000-0000-000000000002' };
    await controller.obsoleteRecipe('r-001', dto);

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(ObsoleteRecipeCommand));
    const cmd = commandBus.execute.mock.calls[0]![0] as ObsoleteRecipeCommand;
    expect(cmd.recipeId).toBe('r-001');
    expect(cmd.obsoletedBy).toBe('admin');
  });

  it('POST /recipes/:id/versions → dispatches PublishRecipeVersionCommand', async () => {
    commandBus.execute.mockResolvedValue(undefined);
    const dto = {
      version: '1.0.0',
      steps: [],
      publishedBy: 'engineer1',
      correlationId: '00000000-0000-0000-0000-000000000003',
    };
    await controller.publishVersion('r-001', dto);

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(PublishRecipeVersionCommand));
    const cmd = commandBus.execute.mock.calls[0]![0] as PublishRecipeVersionCommand;
    expect(cmd.recipeId).toBe('r-001');
    expect(cmd.version).toBe('1.0.0');
    expect(cmd.publishedBy).toBe('engineer1');
  });

  it('GET /recipes/:id/versions/:version → dispatches GetRecipeVersionQuery', async () => {
    queryBus.execute.mockResolvedValue({ id: 'rvp-001', recipeId: 'r-001', version: '1.0.0' });
    await controller.getRecipeVersion('r-001', '1.0.0');

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetRecipeVersionQuery));
    const q = queryBus.execute.mock.calls[0]![0] as GetRecipeVersionQuery;
    expect(q.recipeId).toBe('r-001');
    expect(q.version).toBe('1.0.0');
  });
});
