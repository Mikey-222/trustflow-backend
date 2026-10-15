import { Module, Injectable, OnModuleDestroy } from '@nestjs/common';
import { initTracing } from './tracing';

@Injectable()
export class TracingService implements OnModuleDestroy {
  onModuleDestroy(): void {
    // Cleanup handled by signal handlers in tracing.ts
  }
}

@Module({
  providers: [TracingService],
  exports: [TracingService],
})
export class TracingModule {
  constructor() {
    initTracing();
  }
}
