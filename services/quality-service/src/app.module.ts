import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { RecordMeasurementHandler } from './application/commands/record-measurement.handler';
import { GetInspectionResultsHandler } from './application/queries/get-inspection-results.handler';
import { MeasurementRecordedHandler } from './application/events/measurement-recorded.handler';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { InspectionController } from './api/inspection.controller';

@Module({
  imports: [CqrsModule, ScheduleModule.forRoot(), PersistenceModule, MessagingModule],
  controllers: [InspectionController],
  providers: [RecordMeasurementHandler, GetInspectionResultsHandler, MeasurementRecordedHandler],
})
export class AppModule {}
