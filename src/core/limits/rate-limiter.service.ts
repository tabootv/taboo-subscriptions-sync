import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { delay } from '../utils/delay.util';

@Injectable()
export class RateLimiterService {
  private requestQueue: Array<{
    resolve: () => void;
    timestamp: number;
  }> = [];
  private isProcessing = false;
  private readonly requestsPerSecond: number;
  private readonly minDelayBetweenRequests: number;
  private lastRequestTime = 0;
  private consecutiveRateLimits = 0;
  private readonly maxConsecutiveRateLimits = 3;

  constructor(private readonly configService: ConfigService) {
    this.requestsPerSecond = this.configService.get<number>(
      'WHOP_API_REQUESTS_PER_SECOND',
      2,
    );
    this.minDelayBetweenRequests = 1000 / this.requestsPerSecond;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.requestQueue.push({
        resolve,
        timestamp: Date.now(),
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (!request) break;

      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const delayNeeded = Math.max(
        0,
        this.minDelayBetweenRequests - timeSinceLastRequest,
      );

      if (delayNeeded > 0) {
        await delay(delayNeeded);
      }

      this.lastRequestTime = Date.now();
      request.resolve();
    }

    this.isProcessing = false;
  }

  onRateLimitDetected(): void {
    this.consecutiveRateLimits++;
    if (this.consecutiveRateLimits >= this.maxConsecutiveRateLimits) {
      const backoffDelay = Math.min(this.minDelayBetweenRequests * 5, 10000);
      this.lastRequestTime = Date.now() + backoffDelay;
      this.consecutiveRateLimits = 0;
    }
  }

  onSuccess(): void {
    if (this.consecutiveRateLimits > 0) {
      this.consecutiveRateLimits = Math.max(0, this.consecutiveRateLimits - 1);
    }
  }
}
