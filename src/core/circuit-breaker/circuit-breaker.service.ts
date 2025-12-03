import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Opossum from 'opossum';
import { logger } from '../logger/logger.config';

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  name?: string;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = logger();
  private readonly breakers: Map<string, any> = new Map();

  constructor(private readonly configService: ConfigService) {}

  createCircuitBreaker<T>(
    fn: (...args: any[]) => Promise<T>,
    options?: CircuitBreakerOptions,
  ): any {
    const name = options?.name || 'default';
    const timeout =
      options?.timeout ||
      this.configService.get<number>('CIRCUIT_BREAKER_TIMEOUT', 10000);
    const errorThresholdPercentage =
      options?.errorThresholdPercentage ||
      this.configService.get<number>('CIRCUIT_BREAKER_ERROR_THRESHOLD', 5);
    const resetTimeout =
      options?.resetTimeout ||
      this.configService.get<number>('CIRCUIT_BREAKER_RESET_TIMEOUT', 30000);

    try {
      const Breaker = (Opossum as any).default || Opossum;
      const breaker = new Breaker(fn, {
        timeout,
        errorThresholdPercentage,
        resetTimeout,
        name,
      });

      breaker.on('open', () => {
        this.logger.warn(
          { circuitBreaker: name, state: 'open' },
          'Circuit breaker opened',
        );
      });

      breaker.on('halfOpen', () => {
        this.logger.info(
          { circuitBreaker: name, state: 'halfOpen' },
          'Circuit breaker half-open',
        );
      });

      breaker.on('close', () => {
        this.logger.info(
          { circuitBreaker: name, state: 'close' },
          'Circuit breaker closed',
        );
      });

      breaker.on('failure', (error) => {
        this.logger.error(
          { circuitBreaker: name, error: error.message },
          'Circuit breaker failure',
        );
      });

      this.breakers.set(name, breaker);
      return breaker;
    } catch (error: any) {
      this.logger.error(
        { error: error.message, stack: error.stack },
        'Failed to create circuit breaker',
      );
      throw error;
    }
  }

  getCircuitBreaker(name: string): any {
    return this.breakers.get(name);
  }

  getCircuitBreakerState(name: string): {
    state: string;
    enabled: boolean;
    stats: any;
  } | null {
    const breaker = this.breakers.get(name);
    if (!breaker) return null;

    let state = 'closed';
    if (breaker.open) {
      state = 'open';
    } else if (breaker.halfOpen) {
      state = 'halfOpen';
    }

    return {
      state,
      enabled: breaker.enabled,
      stats: breaker.stats,
    };
  }

  getAllCircuitBreakersState(): Record<string, any> {
    const states: Record<string, any> = {};
    this.breakers.forEach((breaker, name) => {
      let state = 'closed';
      if (breaker.open) {
        state = 'open';
      } else if (breaker.halfOpen) {
        state = 'halfOpen';
      }

      states[name] = {
        state,
        enabled: breaker.enabled,
        stats: breaker.stats,
      };
    });
    return states;
  }

  createProviderCircuitBreaker<T>(
    provider: string,
    fn: (...args: any[]) => Promise<T>,
    options?: Omit<CircuitBreakerOptions, 'name'>,
  ): any {
    const name = `${provider}-api`;
    return this.createCircuitBreaker(fn, {
      ...options,
      name,
    });
  }

  getProviderCircuitBreaker(provider: string): any {
    const name = `${provider}-api`;
    return this.getCircuitBreaker(name);
  }

  getProviderCircuitBreakerState(provider: string): {
    state: string;
    enabled: boolean;
    stats: any;
  } | null {
    const name = `${provider}-api`;
    return this.getCircuitBreakerState(name);
  }

  isProviderCircuitBreakerOpen(provider: string): boolean {
    const state = this.getProviderCircuitBreakerState(provider);
    return state?.state === 'open';
  }

  getProviderCircuitBreakerStates(): Record<string, any> {
    const providerStates: Record<string, any> = {};

    this.breakers.forEach((breaker, name) => {
      if (name.endsWith('-api')) {
        const provider = name.replace('-api', '');

        let state = 'closed';
        if (breaker.open) {
          state = 'open';
        } else if (breaker.halfOpen) {
          state = 'halfOpen';
        }

        providerStates[provider] = {
          state,
          enabled: breaker.enabled,
          stats: breaker.stats,
        };
      }
    });

    return providerStates;
  }
}
