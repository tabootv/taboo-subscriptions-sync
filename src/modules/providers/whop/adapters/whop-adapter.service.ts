import { Injectable } from '@nestjs/common';
import { logger } from '../../../../core/logger/logger.config';
import { ProviderMetadata } from '../../../../core/providers';
import {
  Membership,
  MembershipFilters,
  Payment,
  PaymentFilters,
  ProviderAdapter,
  ProviderCapabilities,
  Renewal,
  RenewalFilters,
} from '../../../../domain/subscriptions';
import { WhopApiClientService } from './whop-api-client.service';

@Injectable()
@ProviderMetadata({
  name: 'whop',
  displayName: 'Whop',
  description: 'Whop payment provider adapter',
  enabled: true,
})
export class WhopAdapter implements ProviderAdapter {
  private readonly logger = logger();
  readonly providerName = 'whop';

  constructor(private readonly whopApiClient: WhopApiClientService) {}

  async getMemberships(filters: MembershipFilters): Promise<Membership[]> {
    try {
      const response = await this.whopApiClient.getMemberships({
        created_after: filters.startDate.toISOString(),
        created_before: filters.endDate.toISOString(),
        statuses: filters.statuses,
        limit: filters.limit,
        cursor: filters.cursor,
        useDefaultDateFilter: false,
      });

      const rawMemberships = response.data || [];
      return rawMemberships.map((m: any) => ({
        ...m,
        provider: this.providerName,
      }));
    } catch (error: any) {
      this.logger.error(
        { error: error.message, filters },
        'Failed to fetch memberships',
      );
      throw error;
    }
  }

  async getPayments(filters: PaymentFilters): Promise<Payment[]> {
    try {
      const response = await this.whopApiClient.getPayments({
        created_after: filters.startDate.toISOString(),
        created_before: filters.endDate.toISOString(),
        billing_reasons: filters.billingReasons,
        substatuses: filters.substatuses,
        limit: filters.limit,
        cursor: filters.cursor,
        useDefaultDateFilter: false,
      });

      const rawPayments = response.data || [];
      return rawPayments.map((p: any) => ({
        ...p,
        provider: this.providerName,
      }));
    } catch (error: any) {
      this.logger.error(
        { error: error.message, filters },
        'Failed to fetch payments',
      );
      throw error;
    }
  }

  async getRenewals(filters: RenewalFilters): Promise<Renewal[]> {
    try {
      const response = await this.whopApiClient.getPayments({
        created_after: filters.startDate.toISOString(),
        created_before: filters.endDate.toISOString(),
        billing_reasons: ['subscription_cycle'],
        limit: filters.limit,
        cursor: filters.cursor,
        useDefaultDateFilter: false,
      });

      const rawPayments = response.data || [];
      return rawPayments.map((p: any) => ({
        ...p,
        provider: this.providerName,
      }));
    } catch (error: any) {
      this.logger.error(
        { error: error.message, filters },
        'Failed to fetch renewals',
      );
      throw error;
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsTrials: true,
      supportsRenewals: true,
      supportsRefunds: false,
      supportedCurrencies: ['usd', 'eur'],
      supportedBillingPeriods: [30, 365],
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.whopApiClient.getMemberships({
        limit: 1,
        useDefaultDateFilter: false,
      });
      return true;
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Health check failed');
      return false;
    }
  }

  async getMembershipById(id: string): Promise<any> {
    return this.whopApiClient.getMembership(id);
  }

  async getMemberById(id: string): Promise<any> {
    return this.whopApiClient.getMember(id);
  }

  async getPaymentById(id: string): Promise<any> {
    return this.whopApiClient.getPayment(id);
  }

  async getPlanById(id: string): Promise<any> {
    return this.whopApiClient.getPlan(id);
  }
}
