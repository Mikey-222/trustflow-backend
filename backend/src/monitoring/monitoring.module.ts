import { Module, Global } from '@nestjs/common';
import { HealthService } from './health.service';
import { MetricsService } from './metrics.service';
import { HealthController } from './health.controller';
import { MetricsHttpInterceptor } from './metrics-http.interceptor';
import { RequestTimeoutInterceptor } from '../common/http/request-timeout.interceptor';
import { DatabaseModule } from '../common/database/database.module';
import { SorobanMetricsService } from './soroban-metrics.service';
import { SorobanRpcMetricsInterceptor } from './soroban-rpc-metrics.interceptor';
import { TracingService } from './tracing.service';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    MetricsService,
    MetricsHttpInterceptor,
    RequestTimeoutInterceptor,
    SorobanMetricsService,
    SorobanRpcMetricsInterceptor,
    TracingService,
  ],
  exports: [
    HealthService,
    MetricsService,
    MetricsHttpInterceptor,
    RequestTimeoutInterceptor,
    SorobanMetricsService,
    SorobanRpcMetricsInterceptor,
    TracingService,
  ],
})
export class MonitoringModule {}
