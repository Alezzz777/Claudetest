import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';

// Commands
import { CreateQualityPlanHandler } from './application/commands/create-quality-plan.handler';
import { ActivateQualityPlanHandler } from './application/commands/activate-quality-plan.handler';
import { RecordMeasurementHandler } from './application/commands/record-measurement.handler';
import { CloseNonConformanceHandler } from './application/commands/close-nonconformance.handler';

// Queries
import { GetInspectionResultsHandler } from './application/queries/get-inspection-results.handler';
import { ListNonConformancesHandler } from './application/queries/list-nonconformances.handler';

// Event Handlers
import { MeasurementRecordedHandler } from './application/events/measurement-recorded.handler';

// Infrastructure
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';

// API
import { InspectionController } from './api/inspection.controller';

@Module({
  imports: [CqrsModule, ScheduleModule.forRoot(), PersistenceModule, MessagingModule],
  controllers: [InspectionController],
  providers: [
    // Commands
    CreateQualityPlanHandler,
    ActivateQualityPlanHandler,
    RecordMeasurementHandler,
    CloseNonConformanceHandler,
    // Queries
    GetInspectionResultsHandler,
    ListNonConformancesHandler,
    // Event Handlers
    MeasurementRecordedHandler,
  ],
})
export class AppModule {}
