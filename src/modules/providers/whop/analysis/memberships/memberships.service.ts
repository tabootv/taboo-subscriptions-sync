import { Injectable } from '@nestjs/common';
import { logger } from '../../../../../core/logger/logger.config';
import { PlanCacheService } from '../shared/cache/plan-cache.service';
import { EmailEnricherService } from '../shared/enrichers/email-enricher.service';
import { MembershipFetcherService } from '../shared/fetchers/membership-fetcher.service';
import { PaymentFetcherService } from '../shared/fetchers/payment-fetcher.service';
import {
  ConvertedItemDto,
  FirstPaidItemDto,
  MembershipsResponseDto,
  NotConvertedItemDto,
  PlanInfoDto,
} from './dto/memberships-response.dto';

@Injectable()
export class MembershipsService {
  private readonly logger = logger();

  constructor(
    private readonly membershipFetcher: MembershipFetcherService,
    private readonly paymentFetcher: PaymentFetcherService,
    private readonly emailEnricher: EmailEnricherService,
    private readonly planCache: PlanCacheService,
  ) {}

  async analyzeMemberships(
    startDate: Date,
    endDate: Date,
  ): Promise<MembershipsResponseDto> {
    this.logger.info(
      {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      'Analyzing memberships',
    );

    const [trialing, active, canceled] = await Promise.all([
      this.membershipFetcher.fetchByStatus('trialing', startDate, endDate),
      this.membershipFetcher.fetchByStatus('active', startDate, endDate),
      this.membershipFetcher.fetchByStatus(
        ['canceled', 'expired'],
        startDate,
        endDate,
      ),
    ]);

    const [trialingWithEmails, activeWithEmails, canceledWithEmails] =
      await Promise.all([
        this.emailEnricher.enrichMemberships(trialing),
        this.emailEnricher.enrichMemberships(active),
        this.emailEnricher.enrichMemberships(canceled),
      ]);

    this.logger.info('Emails enriched, warming up plan cache');

    await this.warmupPlanCache([
      ...trialingWithEmails,
      ...activeWithEmails,
      ...canceledWithEmails,
    ]);

    this.logger.info('Plan cache warmed up, fetching payments');

    const firstPayments =
      await this.paymentFetcher.fetchSubscriptionCreatePayments(
        startDate,
        endDate,
      );

    this.logger.info(
      { paymentsCount: firstPayments.length },
      'Payments fetched, identifying conversions',
    );

    const converted = await this.identifyConversions(
      activeWithEmails,
      firstPayments,
    );

    this.logger.info(
      { convertedCount: converted.length },
      'Conversions identified, identifying non-conversions',
    );

    const notConverted = await this.identifyNonConversions(
      canceledWithEmails,
      firstPayments,
    );

    this.logger.info(
      { notConvertedCount: notConverted.length },
      'Non-conversions identified, processing first paid',
    );

    const firstPaid = this.processFirstPaid(firstPayments);

    this.logger.info(
      { firstPaidCount: firstPaid.length },
      'First paid processed, building trials with plan',
    );

    const trialsWithPlan = await Promise.all(
      trialingWithEmails.map(async (m) => ({
        id: m.id,
        userId: m.userId,
        email: m.email,
        createdAt: m.createdAt,
        status: m.status,
        plan: await this.extractPlanInfo(m.membership),
        trialEndsAt: m.membership?.renewal_period_end || null,
      })),
    );

    this.logger.info(
      { trialsCount: trialsWithPlan.length },
      'Trials with plan built',
    );

    this.logger.info(
      {
        trials: trialsWithPlan.length,
        converted: converted.length,
        notConverted: notConverted.length,
        firstPaid: firstPaid.length,
      },
      'Memberships analysis completed',
    );

    const response = {
      analysis: {
        trials: trialsWithPlan,
        converted,
        notConverted,
        firstPaid,
      },
    };

    try {
      JSON.stringify(response);
      this.logger.info('Response is serializable');
    } catch (error: any) {
      this.logger.error(
        { error: error.message },
        'Response serialization failed',
      );
      throw error;
    }

    return response;
  }

  private async identifyConversions(
    active: any[],
    payments: any[],
  ): Promise<ConvertedItemDto[]> {
    const paymentsByMembership = this.groupPaymentsByMembership(payments);
    const paymentsByUser = this.groupPaymentsByUser(payments);
    const converted: ConvertedItemDto[] = [];

    for (const activeMember of active) {
      const membershipId = activeMember.id;
      const userId = activeMember.userId;

      const membershipPayments = paymentsByMembership.get(membershipId) || [];
      const userPayments = paymentsByUser.get(userId) || [];
      const relevantPayments =
        membershipPayments.length > 0 ? membershipPayments : userPayments;

      if (relevantPayments.length > 0) {
        const firstPayment = relevantPayments[0];
        converted.push({
          id: activeMember.id,
          userId: activeMember.userId,
          email: activeMember.email,
          convertedAt: firstPayment.paid_at || activeMember.updatedAt,
          plan: await this.extractPlanInfo(activeMember.membership),
          firstPayment: {
            id: firstPayment.id,
            amount: firstPayment.total || firstPayment.usd_total,
            currency: firstPayment.currency || 'usd',
            paidAt: firstPayment.paid_at,
          },
        });
      }
    }

    return converted;
  }

  private async identifyNonConversions(
    canceled: any[],
    payments: any[],
  ): Promise<NotConvertedItemDto[]> {
    const paymentsByMembership = this.groupPaymentsByMembership(payments);
    const paymentsByUser = this.groupPaymentsByUser(payments);
    const notConverted: NotConvertedItemDto[] = [];

    for (const canceledMember of canceled) {
      const membershipId = canceledMember.id;
      const userId = canceledMember.userId;

      const membershipPayments = paymentsByMembership.get(membershipId) || [];
      const userPayments = paymentsByUser.get(userId) || [];

      if (membershipPayments.length === 0 && userPayments.length === 0) {
        const membership = canceledMember.membership;
        const createdAt = membership?.created_at
          ? new Date(membership.created_at)
          : null;
        const canceledAt = canceledMember.updatedAt
          ? new Date(canceledMember.updatedAt)
          : null;

        let daysInTrial: number | null = null;
        if (createdAt && canceledAt) {
          daysInTrial = Math.floor(
            (canceledAt.getTime() - createdAt.getTime()) /
              (1000 * 60 * 60 * 24),
          );
        }

        notConverted.push({
          id: canceledMember.id,
          userId: canceledMember.userId,
          email: canceledMember.email,
          status: canceledMember.status || 'canceled',
          createdAt: membership?.created_at || '',
          canceledAt: canceledMember.updatedAt,
          cancellationReason: membership?.cancellation_reason || null,
          plan: await this.extractPlanInfo(membership),
          trialEndsAt: membership?.renewal_period_end || null,
          daysInTrial,
        });
      }
    }

    return notConverted;
  }

  private processFirstPaid(payments: any[]): FirstPaidItemDto[] {
    return payments.map((p) => ({
      id: p.membership?.id || p.membership_id || p.id,
      userId: p.user?.id || p.user_id || '',
      email: p.user?.email || p.membership?.user?.email || 'N/A',
      paidAt: p.paid_at || '',
      amount: p.total || p.usd_total || null,
      currency: p.currency || 'usd',
    }));
  }

  private groupPaymentsByUser(payments: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();
    for (const payment of payments) {
      const userId = payment.user?.id || payment.user_id;
      if (!userId) continue;
      if (!grouped.has(userId)) grouped.set(userId, []);
      grouped.get(userId)!.push(payment);
    }
    return grouped;
  }

  private groupPaymentsByMembership(payments: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();
    for (const payment of payments) {
      const membershipId =
        payment.membership?.id || payment.membership_id || payment.member?.id;
      if (!membershipId) continue;
      if (!grouped.has(membershipId)) grouped.set(membershipId, []);
      grouped.get(membershipId)!.push(payment);
    }
    return grouped;
  }

  private async extractPlanInfo(membership: any): Promise<PlanInfoDto | null> {
    if (!membership) return null;

    const planRef = membership.plan;
    if (!planRef) return null;

    const planId = planRef.id || planRef;

    if (typeof planId === 'string' && planId.startsWith('plan_')) {
      try {
        const fullPlan = await this.planCache.get(planId);
        if (fullPlan) {
          return {
            id: fullPlan.id || planId,
            title:
              fullPlan.title ||
              fullPlan.internal_notes ||
              fullPlan.plan_name ||
              null,
            billingPeriod: fullPlan.billing_period || null,
            renewalPrice: fullPlan.renewal_price || fullPlan.base_price || null,
            currency: fullPlan.currency || membership.currency || 'usd',
            trialPeriodDays: fullPlan.trial_period_days || null,
          };
        }
      } catch (error: any) {
        this.logger.warn(
          { planId, error: error.message },
          'Failed to get plan from cache',
        );
      }
    }

    return {
      id: planRef.id || null,
      title:
        planRef.title || planRef.internal_notes || planRef.plan_name || null,
      billingPeriod: planRef.billing_period || null,
      renewalPrice: planRef.renewal_price || planRef.base_price || null,
      currency: planRef.currency || membership.currency || 'usd',
      trialPeriodDays: planRef.trial_period_days || null,
    };
  }

  private async warmupPlanCache(memberships: any[]): Promise<void> {
    const planIds = memberships
      .map((m) => m.membership?.plan?.id || m.plan?.id)
      .filter((id) => id && typeof id === 'string' && id.startsWith('plan_'));

    const uniquePlanIds = [...new Set(planIds)];
    if (uniquePlanIds.length > 0) {
      await this.planCache.warmupCache(uniquePlanIds);
    }
  }
}
