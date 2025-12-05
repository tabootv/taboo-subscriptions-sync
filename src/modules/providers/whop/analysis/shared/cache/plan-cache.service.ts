import { Injectable } from '@nestjs/common';
import { logger } from '../../../../../../core/logger/logger.config';
import { WhopApiClientService } from '../../../adapters/whop-api-client.service';

@Injectable()
export class PlanCacheService {
  private readonly logger = logger();
  private readonly cache = new Map<string, any>();
  private readonly cacheTimestamps = new Map<string, number>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(private readonly whopApiClient: WhopApiClientService) {}

  async get(planId: string): Promise<any | null> {
    const cached = this.cache.get(planId);
    const timestamp = this.cacheTimestamps.get(planId);

    if (cached && timestamp && Date.now() - timestamp < this.CACHE_TTL_MS) {
      return cached;
    }

    try {
      const plan = await this.whopApiClient.getPlan(planId);
      this.cache.set(planId, plan);
      this.cacheTimestamps.set(planId, Date.now());
      return plan;
    } catch (error: any) {
      this.logger.warn(
        { planId, error: error.message },
        'Failed to fetch plan',
      );
      return null;
    }
  }

  async warmupCache(planIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(planIds)];
    const toFetch = uniqueIds.filter((id) => {
      const timestamp = this.cacheTimestamps.get(id);
      return !timestamp || Date.now() - timestamp >= this.CACHE_TTL_MS;
    });

    if (toFetch.length === 0) {
      this.logger.info('Plan cache warmup skipped - all plans cached');
      return;
    }

    this.logger.info(
      { total: uniqueIds.length, toFetch: toFetch.length },
      'Warming up plan cache',
    );

    const BATCH_SIZE = 10;
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      this.logger.info(
        {
          batch: i / BATCH_SIZE + 1,
          totalBatches: Math.ceil(toFetch.length / BATCH_SIZE),
        },
        'Fetching plan batch',
      );
      await Promise.all(batch.map((id) => this.get(id)));
    }

    this.logger.info('Plan cache warmup completed');
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }
}
