import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { DeadLetterQueueService } from '../dlq/dead-letter-queue.service';
import { logger } from '../logger/logger.config';

export enum DegradationLevel {
  NORMAL = 'normal',
  DEGRADED = 'degraded',
  CRITICAL = 'critical',
}

@Injectable()
export class GracefulDegradationService {
  private readonly logger = logger();
  private readonly maxQueueSize: number;
  private readonly queueAlertThreshold: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly dlqService: DeadLetterQueueService,
  ) {
    this.maxQueueSize = this.configService.get<number>('MAX_QUEUE_SIZE', 1000);
    this.queueAlertThreshold = this.configService.get<number>(
      'QUEUE_ALERT_THRESHOLD',
      800,
    );
  }

  canProcessAnalysis(): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    const whopState =
      this.circuitBreakerService.getCircuitBreakerState('whop-api');
    if (whopState?.state === 'open') {
      return {
        allowed: false,
        reason: 'Whop API is unavailable (circuit breaker open)',
        retryAfter: 60,
      };
    }

    const dlqSize = this.dlqService.getSize();
    const maxDlqSize = this.configService.get<number>('MAX_DLQ_SIZE', 10000);
    if (dlqSize >= maxDlqSize) {
      return {
        allowed: false,
        reason: 'Dead letter queue is full',
        retryAfter: 300,
      };
    }

    return { allowed: true };
  }

  canProcessBackfill(): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    const whopState =
      this.circuitBreakerService.getCircuitBreakerState('whop-api');
    if (whopState?.state === 'open') {
      return {
        allowed: false,
        reason: 'Whop API is unavailable (circuit breaker open)',
      };
    }

    return { allowed: true };
  }

  getDegradationLevel(): DegradationLevel {
    const whopState =
      this.circuitBreakerService.getCircuitBreakerState('whop-api');
    const dlqSize = this.dlqService.getSize();
    const maxDlqSize = this.configService.get<number>('MAX_DLQ_SIZE', 10000);
    const dlqAlertThreshold = this.configService.get<number>(
      'DLQ_ALERT_THRESHOLD',
      8000,
    );

    if (dlqSize >= dlqAlertThreshold || whopState?.state === 'open') {
      return DegradationLevel.CRITICAL;
    }

    if (dlqSize > maxDlqSize * 0.5 || whopState?.state === 'halfOpen') {
      return DegradationLevel.DEGRADED;
    }

    return DegradationLevel.NORMAL;
  }

  throwIfCannotProcess(operation: 'analysis' | 'backfill'): void {
    const check =
      operation === 'analysis'
        ? this.canProcessAnalysis()
        : this.canProcessBackfill();

    if (!check.allowed) {
      const exception = new ServiceUnavailableException({
        message: check.reason,
        retryAfter: check.retryAfter,
      });

      if (check.retryAfter) {
        (exception as any).retryAfter = check.retryAfter;
      }

      throw exception;
    }
  }
}
