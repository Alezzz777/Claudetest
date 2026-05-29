import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { EdgeModeService } from '../../infrastructure/edge/edge-mode.service';

export class GetEdgeBufferStatusQuery {}

export interface EdgeBufferStatus {
  pendingCount: number;
  isEdgeMode: boolean;
}

@QueryHandler(GetEdgeBufferStatusQuery)
export class GetEdgeBufferStatusHandler implements IQueryHandler<GetEdgeBufferStatusQuery, EdgeBufferStatus> {
  constructor(@Inject(EdgeModeService) private readonly edgeMode: EdgeModeService) {}

  async execute(): Promise<EdgeBufferStatus> {
    const pendingCount = await this.edgeMode.getPendingCount();
    return {
      pendingCount,
      isEdgeMode: this.edgeMode.isEdge(),
    };
  }
}
