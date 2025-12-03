import { Injectable } from '@nestjs/common';
import { logger } from '../../../../../../core/logger/logger.config';
import { WhopApiClientService } from '../../../adapters/whop-api-client.service';

@Injectable()
export class PaymentFetcherService {
  private readonly logger = logger();
  private readonly MAX_PAGES = 200;

  constructor(private readonly whopApiClient: WhopApiClientService) {}

  async fetchSubscriptionCyclePayments(startDate: Date, endDate: Date): Promise<any[]> {
    return this.fetchPaymentsByBillingReason('subscription_cycle', startDate, endDate);
  }

  async fetchSubscriptionCreatePayments(startDate: Date, endDate: Date): Promise<any[]> {
    return this.fetchPaymentsByBillingReason('subscription_create', startDate, endDate);
  }

  private async fetchPaymentsByBillingReason(
    billingReason: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any[]> {
    const allPayments: any[] = [];
    let cursor: string | null = null;
    let pageCount = 0;
    let hasNextPage = true;

    while (hasNextPage && pageCount < this.MAX_PAGES) {
      const response = await this.whopApiClient.getPayments({
        created_after: startDate.toISOString(),
        created_before: endDate.toISOString(),
        billing_reasons: billingReason,
        substatuses: 'succeeded',
        cursor,
      });

      const payments = response.data || response.payments || response || [];
      if (!Array.isArray(payments) || payments.length === 0) break;

      const filtered = payments.filter((p) => {
        if (!p.paid_at) return false;
        const paidAt = new Date(p.paid_at);
        return paidAt >= startDate && paidAt <= endDate;
      });

      allPayments.push(...filtered);

      const pageInfo = response.page_info || response.pagination;
      if (pageInfo) {
        hasNextPage = pageInfo.has_next_page === true;
        cursor = pageInfo.end_cursor || null;
      } else {
        hasNextPage = payments.length >= 100;
        cursor = null;
      }

      pageCount++;
    }

    const uniquePayments = Array.from(
      new Map(allPayments.map((p) => [p.id, p])).values(),
    );

    this.logger.info({
      billingReason,
      total: uniquePayments.length,
      pages: pageCount,
    }, 'Payments fetched');

    return uniquePayments;
  }
}
