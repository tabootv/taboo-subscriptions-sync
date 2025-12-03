import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import { CheckpointService } from '../../../../core/checkpoint/checkpoint.service';
import { GracefulDegradationService } from '../../../../core/graceful-degradation/graceful-degradation.service';
import { ProcessingLimitsService } from '../../../../core/limits/processing-limits.service';
import { logger } from '../../../../core/logger/logger.config';
import { Timeout } from '../../../../core/timeout/timeout.decorator';
import { TimeoutInterceptor } from '../../../../core/timeout/timeout.interceptor';
import { WhopApiClientService } from '../adapters/whop-api-client.service';

@Controller('jobs/whop/backfill')
@UseInterceptors(TimeoutInterceptor)
export class WhopBackfillController {
  private readonly logger = logger();

  constructor(
    private readonly whopApiClient: WhopApiClientService,
    private readonly limitsService: ProcessingLimitsService,
    private readonly checkpointService: CheckpointService,
    private readonly gracefulDegradation: GracefulDegradationService,
  ) {}

  @Post('memberships')
  @HttpCode(HttpStatus.OK)
  @Timeout(1800000)
  async backfillMemberships(
    @Headers('authorization') auth?: string,
  ): Promise<{ processed: number; message: string }> {
    if (!auth) {
      throw new UnauthorizedException('Authorization required');
    }

    this.gracefulDegradation.throwIfCannotProcess('backfill');

    const limits = this.limitsService.getBackfillLimits();
    const startTime = Date.now();
    let processedCount = 0;
    let page = 1;
    const jobType = 'backfill-memberships';

    const checkpoint = this.checkpointService.getLastCheckpoint(jobType);
    if (checkpoint) {
      this.logger.info({ checkpoint }, 'Resuming from checkpoint');
      processedCount = checkpoint.processedCount;
    }

    try {
      while (
        processedCount < limits.maxRecords &&
        page <= limits.maxPages &&
        Date.now() - startTime < limits.maxProcessingTimeMs
      ) {
        if (Date.now() - startTime >= limits.maxProcessingTimeMs) {
          this.logger.warn(
            {
              processedCount,
              page,
              elapsed: Date.now() - startTime,
              maxTime: limits.maxProcessingTimeMs,
            },
            'Backfill timeout reached',
          );
          break;
        }

        const response = await this.whopApiClient.getMemberships({
          page,
          limit: 100,
        });

        const memberships = response.data || [];
        if (memberships.length === 0) {
          break;
        }

        for (const membership of memberships) {
          processedCount++;
        }

        const lastId = memberships[memberships.length - 1]?.id || 'unknown';
        this.checkpointService.saveCheckpoint(jobType, lastId, processedCount);

        page++;
      }

      if (page > limits.maxPages || processedCount >= limits.maxRecords) {
        this.checkpointService.clearCheckpoint(jobType);
      }

      const message =
        processedCount >= limits.maxRecords
          ? 'Max records limit reached'
          : page > limits.maxPages
            ? 'Max pages limit reached'
            : 'Backfill completed';

      return {
        processed: processedCount,
        message,
      };
    } catch (error: any) {
      this.logger.error(
        { error: error.message, processedCount, page },
        'Backfill failed',
      );
      throw error;
    }
  }

  @Post('payments')
  @HttpCode(HttpStatus.OK)
  @Timeout(1800000)
  async backfillPayments(
    @Headers('authorization') auth?: string,
  ): Promise<{ processed: number; message: string }> {
    if (!auth) {
      throw new UnauthorizedException('Authorization required');
    }

    this.gracefulDegradation.throwIfCannotProcess('backfill');

    const limits = this.limitsService.getBackfillLimits();
    const startTime = Date.now();
    let processedCount = 0;
    let page = 1;
    const jobType = 'backfill-payments';

    const checkpoint = this.checkpointService.getLastCheckpoint(jobType);
    if (checkpoint) {
      this.logger.info({ checkpoint }, 'Resuming from checkpoint');
      processedCount = checkpoint.processedCount;
    }

    try {
      while (
        processedCount < limits.maxRecords &&
        page <= limits.maxPages &&
        Date.now() - startTime < limits.maxProcessingTimeMs
      ) {
        if (Date.now() - startTime >= limits.maxProcessingTimeMs) {
          this.logger.warn(
            {
              processedCount,
              page,
              elapsed: Date.now() - startTime,
              maxTime: limits.maxProcessingTimeMs,
            },
            'Backfill timeout reached',
          );
          break;
        }

        const response = await this.whopApiClient.getPayments({
          page,
          limit: 100,
        });

        const payments = response.data || [];
        if (payments.length === 0) {
          break;
        }

        for (const payment of payments) {
          processedCount++;
        }

        const lastId = payments[payments.length - 1]?.id || 'unknown';
        this.checkpointService.saveCheckpoint(jobType, lastId, processedCount);

        page++;
      }

      if (page > limits.maxPages || processedCount >= limits.maxRecords) {
        this.checkpointService.clearCheckpoint(jobType);
      }

      const message =
        processedCount >= limits.maxRecords
          ? 'Max records limit reached'
          : page > limits.maxPages
            ? 'Max pages limit reached'
            : 'Backfill completed';

      return {
        processed: processedCount,
        message,
      };
    } catch (error: any) {
      this.logger.error(
        { error: error.message, processedCount, page },
        'Backfill failed',
      );
      throw error;
    }
  }
}
