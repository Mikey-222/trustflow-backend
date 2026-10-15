import { Module, forwardRef } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { WebhookSubscriptionController } from './webhook-subscription.controller';
import { WebhookSubscriptionService } from './webhook-subscription.service';
import { DiscordService } from './discord.service';
import { WebhookProcessor } from './webhook.processor';
import { OutboxModule } from '../outbox/outbox.module';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [forwardRef(() => OutboxModule), MonitoringModule],
  controllers: [WebhookController, WebhookSubscriptionController],
  providers: [WebhookService, WebhookSubscriptionService, DiscordService, WebhookProcessor],
  exports: [WebhookService, WebhookSubscriptionService, DiscordService],
})
export class WebhookModule {}
