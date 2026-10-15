import { Module } from '@nestjs/common';
import { MilestoneNotificationsGateway } from './milestone-notifications.gateway';
import { MilestoneExpiryScheduler } from './milestone-expiry-scheduler.service';
import { GigModule } from '../gig/gig.module';

@Module({
  imports: [GigModule],
  providers: [MilestoneNotificationsGateway, MilestoneExpiryScheduler],
  exports: [MilestoneNotificationsGateway, MilestoneExpiryScheduler],
})
export class MilestoneNotificationsModule {}
