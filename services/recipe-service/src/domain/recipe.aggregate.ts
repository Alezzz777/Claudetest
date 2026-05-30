import { v4 as uuidv4 } from 'uuid';
import { AggregateRoot, EventEnvelope, createEventEnvelope, MesEventType } from '@mes/shared';

export type RecipeStatus = 'DRAFT' | 'APPROVED' | 'OBSOLETE';

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

export interface RecipeCreatedPayload {
  recipeId: string;
  productCode: string;
  description: string;
  createdAt: string;
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

export interface RecipeObsoletedPayload {
  recipeId: string;
  obsoletedAt: string;
  obsoletedBy: string;
}

/**
 * RecipeAggregate — ISA-88 Master Recipe with versioned steps.
 * Extends shared AggregateRoot for Event Sourcing. Versions are append-only.
 */
export class RecipeAggregate extends AggregateRoot {
  private _productCode: string = '';
  private _description: string = '';
  private _status: RecipeStatus = 'DRAFT';
  private _currentVersion: string = '0.0.0';
  private _publishedVersions: string[] = [];

  constructor() {
    super();
  }

  getAggregateType(): string {
    return 'Recipe';
  }

  protected handleEvent(event: EventEnvelope): void {
    switch (event.type) {
      case MesEventType.RECIPE_CREATED: {
        const d = event.data as RecipeCreatedPayload;
        this._id = d.recipeId;
        this._productCode = d.productCode;
        this._description = d.description;
        this._status = 'DRAFT';
        break;
      }
      case MesEventType.RECIPE_VERSION_PUBLISHED: {
        const d = event.data as RecipeVersionPublishedPayload;
        this._currentVersion = d.version;
        this._publishedVersions.push(d.version);
        this._status = 'APPROVED';
        break;
      }
      case MesEventType.RECIPE_OBSOLETED:
        this._status = 'OBSOLETE';
        break;
    }
  }

  static create(params: {
    productCode: string;
    description: string;
    correlationId?: string;
  }): RecipeAggregate {
    const id = uuidv4();
    const agg = new RecipeAggregate();
    agg._id = id;
    agg.apply(
      createEventEnvelope({
        type: MesEventType.RECIPE_CREATED,
        source: 'urn:mes:recipe-service:Recipe',
        aggregateId: id,
        aggregateType: 'Recipe',
        sequence: 1,
        data: {
          recipeId: id,
          productCode: params.productCode,
          description: params.description,
          createdAt: new Date().toISOString(),
        } as RecipeCreatedPayload,
        correlationId: params.correlationId,
      }),
    );
    return agg;
  }

  publishVersion(params: {
    version: string;
    steps: RecipeStep[];
    publishedBy: string;
    correlationId?: string;
  }): void {
    if (this._status === 'OBSOLETE') throw new Error('Cannot publish version of an obsolete recipe');
    if (this._publishedVersions.includes(params.version)) {
      throw new Error(`Version ${params.version} already published`);
    }
    this.apply(
      createEventEnvelope({
        type: MesEventType.RECIPE_VERSION_PUBLISHED,
        source: 'urn:mes:recipe-service:Recipe',
        aggregateId: this._id,
        aggregateType: 'Recipe',
        sequence: this._version + 1,
        data: {
          recipeId: this._id,
          version: params.version,
          productCode: this._productCode,
          description: `Version ${params.version}`,
          steps: params.steps,
          publishedBy: params.publishedBy,
          publishedAt: new Date().toISOString(),
        } as RecipeVersionPublishedPayload,
        correlationId: params.correlationId,
      }),
    );
  }

  obsolete(obsoletedBy: string, correlationId?: string): void {
    if (this._status === 'OBSOLETE') return;
    this.apply(
      createEventEnvelope({
        type: MesEventType.RECIPE_OBSOLETED,
        source: 'urn:mes:recipe-service:Recipe',
        aggregateId: this._id,
        aggregateType: 'Recipe',
        sequence: this._version + 1,
        data: {
          recipeId: this._id,
          obsoletedAt: new Date().toISOString(),
          obsoletedBy,
        } as RecipeObsoletedPayload,
        correlationId,
      }),
    );
  }

  get productCode(): string { return this._productCode; }
  get description(): string { return this._description; }
  get status(): RecipeStatus { return this._status; }
  get currentVersion(): string { return this._currentVersion; }
  get publishedVersions(): string[] { return [...this._publishedVersions]; }
}
