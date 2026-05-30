import { describe, it, expect } from 'vitest';
import { RecipeAggregate } from '../domain/recipe.aggregate';
import { MesEventType } from '@mes/shared';

const sampleStep = {
  stepId: 'step-1',
  stepNo: 1,
  name: 'Mix',
  workCenterId: 'wc-001',
  parameters: [],
  durationMinutes: 30,
};

describe('RecipeAggregate', () => {
  describe('create()', () => {
    it('should emit RECIPE_CREATED event', () => {
      const recipe = RecipeAggregate.create({ productCode: 'PC-001', description: 'Test recipe' });
      const events = recipe.popUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(MesEventType.RECIPE_CREATED);
    });

    it('should set productCode and description', () => {
      const recipe = RecipeAggregate.create({ productCode: 'PC-002', description: 'Desc' });
      recipe.popUncommittedEvents();
      expect(recipe.productCode).toBe('PC-002');
      expect(recipe.description).toBe('Desc');
      expect(recipe.status).toBe('DRAFT');
    });

    it('should generate a non-empty ID', () => {
      const recipe = RecipeAggregate.create({ productCode: 'PC-003', description: 'Desc' });
      expect(recipe.getId()).toBeTruthy();
      expect(recipe.getId().length).toBeGreaterThan(0);
    });
  });

  describe('publishVersion()', () => {
    it('should emit RECIPE_VERSION_PUBLISHED event and change status to APPROVED', () => {
      const recipe = RecipeAggregate.create({ productCode: 'PC-001', description: 'Test' });
      recipe.popUncommittedEvents();

      recipe.publishVersion({ version: '1.0.0', steps: [sampleStep], publishedBy: 'user1' });
      const events = recipe.popUncommittedEvents();

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(MesEventType.RECIPE_VERSION_PUBLISHED);
      expect(recipe.status).toBe('APPROVED');
      expect(recipe.currentVersion).toBe('1.0.0');
    });

    it('should throw on duplicate version', () => {
      const recipe = RecipeAggregate.create({ productCode: 'PC-001', description: 'Test' });
      recipe.popUncommittedEvents();
      recipe.publishVersion({ version: '1.0.0', steps: [sampleStep], publishedBy: 'user1' });
      recipe.popUncommittedEvents();

      expect(() =>
        recipe.publishVersion({ version: '1.0.0', steps: [sampleStep], publishedBy: 'user1' }),
      ).toThrow('Version 1.0.0 already published');
    });

    it('should throw when recipe is OBSOLETE', () => {
      const recipe = RecipeAggregate.create({ productCode: 'PC-001', description: 'Test' });
      recipe.popUncommittedEvents();
      recipe.obsolete('admin');
      recipe.popUncommittedEvents();

      expect(() =>
        recipe.publishVersion({ version: '1.0.0', steps: [sampleStep], publishedBy: 'user1' }),
      ).toThrow('Cannot publish version of an obsolete recipe');
    });
  });

  describe('obsolete()', () => {
    it('should emit RECIPE_OBSOLETED event', () => {
      const recipe = RecipeAggregate.create({ productCode: 'PC-001', description: 'Test' });
      recipe.popUncommittedEvents();
      recipe.obsolete('admin');

      const events = recipe.popUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(MesEventType.RECIPE_OBSOLETED);
      expect(recipe.status).toBe('OBSOLETE');
    });

    it('should be idempotent — no event if already OBSOLETE', () => {
      const recipe = RecipeAggregate.create({ productCode: 'PC-001', description: 'Test' });
      recipe.popUncommittedEvents();
      recipe.obsolete('admin');
      recipe.popUncommittedEvents();

      // Second call — idempotent
      recipe.obsolete('admin');
      const events = recipe.popUncommittedEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('rehydrate()', () => {
    it('should reconstruct aggregate state from event history', () => {
      const original = RecipeAggregate.create({ productCode: 'PC-001', description: 'Test' });
      const originalId = original.getId();
      original.publishVersion({ version: '1.0.0', steps: [sampleStep], publishedBy: 'user1' });
      const events = original.popUncommittedEvents();
      // Note: popUncommittedEvents was also called for create above, so we need to reload
      // Let's do it properly:
      const recipe2 = RecipeAggregate.create({ productCode: 'PC-999', description: 'Rehydration test' });
      const createEvents = recipe2.popUncommittedEvents();
      recipe2.publishVersion({ version: '2.0.0', steps: [sampleStep], publishedBy: 'user2' });
      const publishEvents = recipe2.popUncommittedEvents();
      const allEvents = [...createEvents, ...publishEvents];

      const rehydrated = RecipeAggregate.rehydrate(RecipeAggregate, allEvents);
      expect(rehydrated.status).toBe('APPROVED');
      expect(rehydrated.currentVersion).toBe('2.0.0');
      expect(rehydrated.productCode).toBe('PC-999');
    });
  });
});
