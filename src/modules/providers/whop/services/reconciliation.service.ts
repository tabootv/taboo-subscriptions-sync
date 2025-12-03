import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProcessingLimitsService } from '../../../../core/limits/processing-limits.service';
import { logger } from '../../../../core/logger/logger.config';
import { WhopApiClientService } from '../adapters/whop-api-client.service';

export interface ReconciliationResult {
  membershipsChecked: number;
  membershipsMissing: number;
  membershipsOutOfSync: number;
  paymentsChecked: number;
  paymentsMissing: number;
  errors: string[];
}

@Injectable()
export class ReconciliationService {
  private readonly logger = logger();
  private readonly enabled: boolean;
  private readonly intervalHours: number;

  constructor(
    private readonly whopApiClient: WhopApiClientService,
    private readonly limitsService: ProcessingLimitsService,
    private readonly configService: ConfigService,
  ) {
    this.enabled =
      this.configService.get<string>('RECONCILIATION_ENABLED', 'true') ===
      'true';
    this.intervalHours = this.configService.get<number>(
      'RECONCILIATION_INTERVAL_HOURS',
      24,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledReconciliation(): Promise<void> {
    if (!this.enabled) return;

    try {
      await this.reconcileAll();
    } catch (error: any) {
      this.logger.error(
        { error: error.message },
        'Scheduled reconciliation failed',
      );
    }
  }

  async reconcileAll(): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
      membershipsChecked: 0,
      membershipsMissing: 0,
      membershipsOutOfSync: 0,
      paymentsChecked: 0,
      paymentsMissing: 0,
      errors: [],
    };

    try {
      const membershipResult = await this.reconcileMemberships();
      result.membershipsChecked = membershipResult.checked;
      result.membershipsMissing = membershipResult.missing.length;
      result.membershipsOutOfSync = membershipResult.outOfSync.length;
      result.errors.push(...membershipResult.errors);

      const paymentResult = await this.reconcilePayments();
      result.paymentsChecked = paymentResult.checked;
      result.paymentsMissing = paymentResult.missing.length;
      result.errors.push(...paymentResult.errors);

      this.logger.info({ result }, 'Reconciliation completed');
    } catch (error: any) {
      result.errors.push(error.message);
      this.logger.error({ error: error.message }, 'Reconciliation failed');
    }

    return result;
  }

  private async reconcileMemberships(): Promise<{
    checked: number;
    missing: string[];
    outOfSync: string[];
    errors: string[];
  }> {
    const result = {
      checked: 0,
      missing: [] as string[],
      outOfSync: [] as string[],
      errors: [] as string[],
    };

    try {
      const limits = this.limitsService.getBackfillLimits();
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= limits.maxPages) {
        const response = await this.whopApiClient.getMemberships({
          page,
          limit: 100,
        });

        const memberships = response.data || [];
        if (memberships.length === 0) {
          hasMore = false;
          break;
        }

        for (const membership of memberships) {
          result.checked++;
        }

        page++;
      }

      this.logger.info(
        {
          checked: result.checked,
          missing: result.missing.length,
          outOfSync: result.outOfSync.length,
        },
        'Memberships reconciliation completed',
      );
    } catch (error: any) {
      result.errors.push(error.message);
      this.logger.error(
        { error: error.message },
        'Memberships reconciliation failed',
      );
    }

    return result;
  }

  private async reconcilePayments(): Promise<{
    checked: number;
    missing: string[];
    errors: string[];
  }> {
    const result = {
      checked: 0,
      missing: [] as string[],
      errors: [] as string[],
    };

    try {
      const limits = this.limitsService.getBackfillLimits();
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= limits.maxPages) {
        const response = await this.whopApiClient.getPayments({
          page,
          limit: 100,
        });

        const payments = response.data || [];
        if (payments.length === 0) {
          hasMore = false;
          break;
        }

        for (const payment of payments) {
          result.checked++;
        }

        page++;
      }

      this.logger.info(
        {
          checked: result.checked,
          missing: result.missing.length,
        },
        'Payments reconciliation completed',
      );
    } catch (error: any) {
      result.errors.push(error.message);
      this.logger.error(
        { error: error.message },
        'Payments reconciliation failed',
      );
    }

    return result;
  }

  async manualReconciliation(): Promise<ReconciliationResult> {
    this.logger.info('Manual reconciliation triggered');
    return this.reconcileAll();
  }
}
