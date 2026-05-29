import { Module } from '@nestjs/common';
import { ErpB2mmlAdapterService } from './erp-b2mml-adapter.service';
import { MessagingModule } from '../../infrastructure/messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  providers: [ErpB2mmlAdapterService],
  exports: [ErpB2mmlAdapterService],
})
export class ErpB2mmlAdapterModule {}
