import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { DeadLetterQueueService } from '../../core/dlq/dead-letter-queue.service';
import { logger } from '../../core/logger/logger.config';
import { ProviderRegistry } from '../../core/providers';

@Injectable()
export class HealthService extends HealthIndicator {
  private readonly logger = logger();

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly dlqService: DeadLetterQueueService,
    private readonly providerRegistry: ProviderRegistry,
  ) {
    super();
  }

  async checkDatabase(): Promise<HealthIndicatorResult> {
    // TODO: Implement real database check when Prisma/TypeORM is added
    const isHealthy = true;
    return this.getStatus('database', isHealthy, {
      message: isHealthy
        ? 'Database connection OK'
        : 'Database connection failed',
    });
  }

  async checkWhopApi(): Promise<HealthIndicatorResult> {
    const whopBreaker =
      this.circuitBreakerService.getCircuitBreaker('whop-api');
    if (!whopBreaker) {
      return this.getStatus('whop-api', true, {
        message: 'Circuit breaker not initialized',
      });
    }

    const state = this.circuitBreakerService.getCircuitBreakerState('whop-api');
    const isHealthy = state?.state === 'closed' || state?.state === 'halfOpen';

    return this.getStatus('whop-api', isHealthy, {
      state: state?.state || 'unknown',
      enabled: state?.enabled || false,
      failures: state?.stats?.failures || 0,
      fires: state?.stats?.fires || 0,
    });
  }

  async checkQueue(): Promise<HealthIndicatorResult> {
    // TODO: Implement real queue check when Bull/BullMQ is added
    const maxQueueSize = this.configService.get<number>('MAX_QUEUE_SIZE', 1000);
    const queueAlertThreshold = this.configService.get<number>(
      'QUEUE_ALERT_THRESHOLD',
      800,
    );
    const currentQueueSize = 0;

    const isHealthy = currentQueueSize < queueAlertThreshold;

    return this.getStatus('queue', isHealthy, {
      currentSize: currentQueueSize,
      maxSize: maxQueueSize,
      threshold: queueAlertThreshold,
      message: isHealthy ? 'Queue size OK' : 'Queue size approaching limit',
    });
  }

  async checkDlq(): Promise<HealthIndicatorResult> {
    const dlqSize = this.dlqService.getSize();
    const maxDlqSize = this.configService.get<number>('MAX_DLQ_SIZE', 10000);
    const dlqAlertThreshold = this.configService.get<number>(
      'DLQ_ALERT_THRESHOLD',
      8000,
    );

    const isHealthy = dlqSize < dlqAlertThreshold;

    return this.getStatus('dlq', isHealthy, {
      currentSize: dlqSize,
      maxSize: maxDlqSize,
      threshold: dlqAlertThreshold,
      percentage: (dlqSize / maxDlqSize) * 100,
      message: isHealthy ? 'DLQ size OK' : 'DLQ size approaching limit',
    });
  }

  async checkCircuitBreakers(): Promise<HealthIndicatorResult> {
    const allBreakers = this.circuitBreakerService.getAllCircuitBreakersState();
    const openBreakers = Object.entries(allBreakers).filter(
      ([, state]) => state.state === 'open',
    );

    const isHealthy = openBreakers.length === 0;

    return this.getStatus('circuit-breakers', isHealthy, {
      total: Object.keys(allBreakers).length,
      open: openBreakers.length,
      breakers: allBreakers,
      message: isHealthy
        ? 'All circuit breakers closed'
        : `${openBreakers.length} circuit breaker(s) open`,
    });
  }

  /**
   * Check health of all providers
   * Includes circuit breaker status and provider API health
   */
  async checkProviders(): Promise<HealthIndicatorResult> {
    const activeProviders = this.providerRegistry.getActiveProviders();
    const providerHealthMap =
      await this.providerRegistry.checkProvidersHealth();
    const circuitBreakerStates =
      this.circuitBreakerService.getProviderCircuitBreakerStates();

    const providersStatus: Record<string, any> = {};
    let healthyCount = 0;
    let unhealthyCount = 0;

    activeProviders.forEach((provider) => {
      const isApiHealthy = providerHealthMap.get(provider.name) ?? false;
      const circuitBreakerState = circuitBreakerStates[provider.name];
      const circuitBreakerOpen = circuitBreakerState?.state === 'open';

      const isHealthy = isApiHealthy && !circuitBreakerOpen;

      if (isHealthy) {
        healthyCount++;
      } else {
        unhealthyCount++;
      }

      providersStatus[provider.name] = {
        enabled: provider.enabled,
        healthy: isHealthy,
        apiHealthy: isApiHealthy,
        circuitBreaker: circuitBreakerState || { state: 'unknown' },
      };
    });

    const isOverallHealthy = unhealthyCount === 0;

    return this.getStatus('providers', isOverallHealthy, {
      total: activeProviders.length,
      healthy: healthyCount,
      unhealthy: unhealthyCount,
      providers: providersStatus,
      message: isOverallHealthy
        ? 'All providers healthy'
        : `${unhealthyCount} provider(s) unhealthy`,
    });
  }
}
