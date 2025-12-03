import { Injectable } from '@nestjs/common';
import { logger } from '../../../../../core/logger/logger.config';
import { PlanCacheService } from '../shared/cache/plan-cache.service';
import { PaymentFetcherService } from '../shared/fetchers/payment-fetcher.service';
import { MembershipStatus } from './dto/renewals-query.dto';
import {
  RenewalItemDto,
  RenewalStatsDto,
  RenewalsResponseDto,
} from './dto/renewals-response.dto';
import { RenewalsDomain } from './renewals.domain';

@Injectable()
export class RenewalsService {
  private readonly logger = logger();

  constructor(
    private readonly paymentFetcher: PaymentFetcherService,
    private readonly planCache: PlanCacheService,
    private readonly renewalsDomain: RenewalsDomain,
  ) {}

  async getRenewalsForPeriod(
    startDate: Date,
    endDate: Date,
    statusFilter?: MembershipStatus[],
  ): Promise<RenewalsResponseDto> {
    this.logger.info(
      {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        statusFilter: statusFilter || 'all',
      },
      'Fetching renewals',
    );

    const payments = await this.paymentFetcher.fetchSubscriptionCyclePayments(
      startDate,
      endDate,
    );

    const uniquePlanIds = [
      ...new Set(payments.map((p) => p.plan?.id).filter(Boolean)),
    ];
    await this.planCache.warmupCache(uniquePlanIds);

    const monthlyRenewals: RenewalItemDto[] = [];
    const yearlyRenewals: RenewalItemDto[] = [];
    const processedMembershipIds = new Set<string>();

    const stats: RenewalStatsDto = {
      total: 0,
      trialing: 0,
      active: 0,
      past_due: 0,
      completed: 0,
      canceled: 0,
      expired: 0,
      unresolved: 0,
      drafted: 0,
      unknown: 0,
    };

    for (const payment of payments) {
      const membershipId = this.renewalsDomain.extractMembershipId(payment);
      if (!membershipId || processedMembershipIds.has(membershipId)) continue;

      const membershipStatus =
        this.renewalsDomain.extractMembershipStatus(payment);

      stats.total++;
      switch (membershipStatus) {
        case 'trialing':
          stats.trialing++;
          break;
        case 'active':
        case 'joined':
          stats.active++;
          break;
        case 'past_due':
          stats.past_due++;
          break;
        case 'completed':
          stats.completed++;
          break;
        case 'canceled':
          stats.canceled++;
          break;
        case 'expired':
          stats.expired++;
          break;
        case 'unresolved':
          stats.unresolved++;
          break;
        case 'drafted':
          stats.drafted++;
          break;
        default:
          stats.unknown++;
          break;
      }

      if (statusFilter && statusFilter.length > 0) {
        const normalizedStatus =
          membershipStatus === 'joined' ? 'active' : membershipStatus;
        if (
          !normalizedStatus ||
          !statusFilter.includes(normalizedStatus as MembershipStatus)
        ) {
          continue;
        }
      }

      const planId = payment.plan?.id;
      const plan = planId ? await this.planCache.get(planId) : null;
      const classification = this.renewalsDomain.classifyRenewal(payment, plan);

      const email =
        payment.user?.email ||
        payment.membership?.user?.email ||
        payment.member?.email ||
        'N/A';

      const renewalItem: RenewalItemDto = {
        id: membershipId,
        userId: payment.user?.id || payment.user_id || '',
        email,
        plan: {
          id: planId || null,
          title: plan?.title || plan?.internal_notes || null,
          billingPeriod: classification.billingPeriod,
          renewalPrice: plan?.renewal_price || payment.total || null,
          currency: plan?.currency || payment.currency,
          trialPeriodDays: plan?.trial_period_days || null,
        },
        nextRenewalDate: classification.nextRenewalDate?.toISOString() || null,
        paidAt: payment.paid_at || '',
        amount: payment.total || payment.usd_total || null,
        billingReason: payment.billing_reason,
        membershipStatus,
      };

      if (classification.isMonthly) {
        monthlyRenewals.push(renewalItem);
      } else if (classification.isYearly) {
        yearlyRenewals.push(renewalItem);
      }

      processedMembershipIds.add(membershipId);
    }

    this.logger.info(
      {
        monthly: monthlyRenewals.length,
        yearly: yearlyRenewals.length,
        total: monthlyRenewals.length + yearlyRenewals.length,
      },
      'Renewals completed',
    );

    return {
      analysis: {
        monthly: {
          count: monthlyRenewals.length,
          emails: monthlyRenewals
            .map((r) => r.email)
            .filter((e) => e !== 'N/A'),
          renewals: monthlyRenewals,
        },
        yearly: {
          count: yearlyRenewals.length,
          emails: yearlyRenewals.map((r) => r.email).filter((e) => e !== 'N/A'),
          renewals: yearlyRenewals,
        },
        stats,
      },
    };
  }
}
