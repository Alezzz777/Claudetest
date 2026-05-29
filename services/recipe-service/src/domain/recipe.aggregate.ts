import { v4 as uuidv4 } from 'uuid';
import { EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

/**
 * ISA-88 Recipe structure:
 * General Recipe → Site Recipe → Master Recipe → Control Recipe
 *
 * This aggregate models the Master Recipe and its versioning lifecycle.
 */
export type RecipeStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'OBSOLETE';

export interface RecipeStep {
  stepId: string;
  stepNo: number;
  name: string;
  workCenterId: string;
  parameters: RecipeParameter[];
  durationMinutes: number;
}

export interface RecipeParameter {
  parameterId: string;
  name: string;
  nominalValue: number;
  lowerLimit: number;
  upperLimit: number;
  uom: string;
}

export interface RecipeVersionPublishedPayload {
  recipeId: string;
  version: string;
  productCode: string;
  description: string;
  steps: RecipeStep[];
  publishedBy: string;
  publishedAt: string;
}

export class RecipeAggregate {
  private _id: string;
  private _productCode: string = '';
  private _currentVersion: string = '0.0.0';
  private _status: RecipeStatus = 'DRAFT';
  private _versions: string[] = [];
  private _sequence: number = 0;
  private _uncommitted: EventEnvelope[] = [];

  constructor(id: string) { this._id = id; }

  static create(params: { productCode: string; description: string; correlationId?: string }): RecipeAggregate {
    const id = uuidv4();
    const agg = new RecipeAggregate(id);
    agg.applyAndRecord(createEventEnvelope({
      type: MesEventType.RECIPE_CREATED,
      source: 'urn:mes:recipe-service:Recipe',
      aggregateId: id, aggregateType: 'Recipe', sequence: 1,
      data: { recipeId: id, productCode: params.productCode, description: params.description, createdAt: new Date().toISOString() },
      correlationId: params.correlationId,
    }));
    return agg;
  }

  publishVersion(params: { version: string; steps: RecipeStep[]; publishedBy: string; correlationId?: string }): void {
    if (this._status === 'OBSOLETE') throw new Error('Cannot publish version of an obsolete recipe');
    const payload: RecipeVersionPublishedPayload = {
      recipeId: this._id, version: params.version, productCode: this._productCode,
      description: `Version ${params.version}`, steps: params.steps,
      publishedBy: params.publishedBy, publishedAt: new Date().toISOString(),
    };
    this.applyAndRecord(createEventEnvelope({
      type: MesEventType.RECIPE_VERSION_PUBLISHED,
      source: 'urn:mes:recipe-service:Recipe',
      aggregateId: this._id, aggregateType: 'Recipe', sequence: this._sequence + 1,
      data: payload, correlationId: params.correlationId,
    }));
  }

  private applyAndRecord(e: EventEnvelope): void { this.apply(e); this._uncommitted.push(e); }
  apply(e: EventEnvelope): void {
    this._sequence = e.sequence;
    if (e.type === MesEventType.RECIPE_CREATED) { this._productCode = (e.data as any).productCode; }
    if (e.type === MesEventType.RECIPE_VERSION_PUBLISHED) {
      const d = e.data as RecipeVersionPublishedPayload;
      this._currentVersion = d.version; this._versions.push(d.version); this._status = 'APPROVED';
    }
    if (e.type === MesEventType.RECIPE_OBSOLETED) { this._status = 'OBSOLETE'; }
  }
  static rehydrate(events: EventEnvelope[]): RecipeAggregate {
    const agg = new RecipeAggregate((events[0]?.data as any)?.recipeId ?? '');
    for (const e of events) agg.apply(e);
    return agg;
  }
  get id() { return this._id; }
  get currentVersion() { return this._currentVersion; }
  get status() { return this._status; }
  popUncommittedEvents(): EventEnvelope[] { const e = [...this._uncommitted]; this._uncommitted = []; return e; }
}
