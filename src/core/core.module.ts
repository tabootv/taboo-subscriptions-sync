import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CheckpointService } from './checkpoint/checkpoint.service';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { DeadLetterQueueService } from './dlq/dead-letter-queue.service';
import { GracefulDegradationService } from './graceful-degradation/graceful-degradation.service';
import { ProcessingLimitsService } from './limits/processing-limits.service';
import { ProvidersModule } from './providers/providers.module';
import { PayloadValidatorService } from './validation/payload-validator.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    ProvidersModule,
  ],
  providers: [
    CircuitBreakerService,
    ProcessingLimitsService,
    PayloadValidatorService,
    DeadLetterQueueService,
    CheckpointService,
    GracefulDegradationService,
  ],
  exports: [
    HttpModule,
    CircuitBreakerService,
    ProcessingLimitsService,
    PayloadValidatorService,
    DeadLetterQueueService,
    CheckpointService,
    GracefulDegradationService,
    ProvidersModule,
  ],
})
export class CoreModule {}
