/**
 * Whop Mapper
 *
 * Converts Whop-specific data structures to unified domain models.
 * Handles normalization of Whop API responses into provider-agnostic formats.
 */

import {
  BillingReason,
  Membership,
  Payment,
  PaymentStatus,
  PlanInfo,
  Renewal,
  SubscriptionStatus,
} from '../models';

/**
 * WhopMapper - Static mapper for Whop data
 */
export class WhopMapper {
  private static readonly PROVIDER_NAME = 'whop';

  /**
   * Map Whop membership to domain Membership model
   *
   * @param whopMembership - Raw membership from Whop API
   * @param email - Optional email (may need to be fetched separately)
   * @returns Normalized Membership
   */
  static toMembership(whopMembership: any, email?: string): Membership {
    return {
      id: whopMembership.id || whopMembership.membership?.id,
      userId: this.extractUserId(whopMembership),
      email: email || whopMembership.user?.email || null,
      status: this.mapMembershipStatus(whopMembership.status),
      provider: this.PROVIDER_NAME,
      plan: this.mapPlan(
        whopMembership.plan || whopMembership.membership?.plan,
      ),
      createdAt:
        whopMembership.created_at || whopMembership.membership?.created_at,
      updatedAt: whopMembership.updated_at,
      canceledAt: whopMembership.canceled_at,
      trialEndsAt:
        whopMembership.trial_end || whopMembership.membership?.trial_end,
      renewalPeriodEnd:
        whopMembership.renewal_period_end ||
        whopMembership.membership?.renewal_period_end,
      cancellationReason:
        whopMembership.cancellation_reason ||
        whopMembership.membership?.cancellation_reason,
      providerData: {
        raw: whopMembership,
      },
    };
  }

  /**
   * Map array of Whop memberships
   */
  static toMemberships(whopMemberships: any[]): Membership[] {
    return whopMemberships.map((m) => this.toMembership(m));
  }

  /**
   * Map Whop payment to domain Payment model
   *
   * @param whopPayment - Raw payment from Whop API
   * @returns Normalized Payment
   */
  static toPayment(whopPayment: any): Payment {
    return {
      id: whopPayment.id,
      membershipId: this.extractMembershipId(whopPayment),
      userId: this.extractUserId(whopPayment),
      email: whopPayment.user?.email || whopPayment.membership?.user?.email,
      provider: this.PROVIDER_NAME,
      amount: whopPayment.total || whopPayment.usd_total || 0,
      currency: whopPayment.currency || 'usd',
      status: this.mapPaymentStatus(whopPayment.status),
      substatus: whopPayment.substatus,
      billingReason: this.mapBillingReason(
        whopPayment.billing_reason || whopPayment.reason,
      ),
      createdAt: whopPayment.created_at,
      paidAt: whopPayment.paid_at || whopPayment.created_at,
      refundedAt: whopPayment.refunded_at,
      plan: whopPayment.plan
        ? {
            id: whopPayment.plan.id || whopPayment.plan,
            title: whopPayment.plan.title || whopPayment.plan.internal_notes,
            billingPeriod: whopPayment.plan.billing_period,
          }
        : undefined,
      providerData: {
        raw: whopPayment,
      },
    };
  }

  /**
   * Map array of Whop payments
   */
  static toPayments(whopPayments: any[]): Payment[] {
    return whopPayments.map((p) => this.toPayment(p));
  }

  /**
   * Map Whop payment to domain Renewal model
   * (Renewals are payments with billing_reason = 'subscription_cycle')
   *
   * @param whopPayment - Raw payment from Whop API
   * @param membershipStatus - Status of the membership at renewal
   * @returns Normalized Renewal
   */
  static toRenewal(whopPayment: any, membershipStatus = 'active'): Renewal {
    return {
      id: this.extractMembershipId(whopPayment),
      userId: this.extractUserId(whopPayment),
      email:
        whopPayment.user?.email || whopPayment.membership?.user?.email || 'N/A',
      provider: this.PROVIDER_NAME,
      plan: this.mapPlan(whopPayment.plan || whopPayment.membership?.plan),
      nextRenewalDate:
        whopPayment.next_renewal_date ||
        whopPayment.membership?.renewal_period_end ||
        '',
      paidAt: whopPayment.paid_at || whopPayment.created_at,
      amount: whopPayment.total || whopPayment.usd_total || 0,
      currency: whopPayment.currency || 'usd',
      billingReason:
        whopPayment.billing_reason ||
        whopPayment.reason ||
        'subscription_cycle',
      membershipStatus,
      providerData: {
        raw: whopPayment,
      },
    };
  }

  /**
   * Map array of Whop payments to renewals
   */
  static toRenewals(whopPayments: any[]): Renewal[] {
    return whopPayments
      .filter((p) => {
        const reason = p.billing_reason || p.reason;
        return reason === 'subscription_cycle';
      })
      .map((p) => this.toRenewal(p));
  }

  /**
   * Map Whop plan to domain PlanInfo
   */
  static mapPlan(whopPlan: any): PlanInfo | null {
    if (!whopPlan) return null;

    if (typeof whopPlan === 'string') {
      return {
        id: whopPlan,
        title: null,
        billingPeriod: null,
        renewalPrice: null,
        currency: 'usd',
        trialPeriodDays: null,
      };
    }

    return {
      id: whopPlan.id,
      title:
        whopPlan.title || whopPlan.internal_notes || whopPlan.plan_name || null,
      billingPeriod: whopPlan.billing_period || null,
      renewalPrice: whopPlan.renewal_price || whopPlan.base_price || null,
      currency: whopPlan.currency || 'usd',
      trialPeriodDays: whopPlan.trial_period_days || null,
    };
  }

  /**
   * Map Whop membership status to domain SubscriptionStatus
   */
  private static mapMembershipStatus(
    whopStatus: string,
  ): SubscriptionStatus | string {
    const statusMap: Record<string, SubscriptionStatus> = {
      trialing: SubscriptionStatus.TRIALING,
      active: SubscriptionStatus.ACTIVE,
      joined: SubscriptionStatus.ACTIVE, // Whop uses 'joined' for active
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      expired: SubscriptionStatus.EXPIRED,
      paused: SubscriptionStatus.PAUSED,
    };

    return statusMap[whopStatus] || whopStatus;
  }

  /**
   * Map Whop payment status to domain PaymentStatus
   */
  private static mapPaymentStatus(whopStatus: string): PaymentStatus | string {
    const statusMap: Record<string, PaymentStatus> = {
      succeeded: PaymentStatus.SUCCEEDED,
      pending: PaymentStatus.PENDING,
      failed: PaymentStatus.FAILED,
      refunded: PaymentStatus.REFUNDED,
      canceled: PaymentStatus.CANCELED,
    };

    return statusMap[whopStatus] || whopStatus;
  }

  /**
   * Map Whop billing reason to domain BillingReason
   */
  private static mapBillingReason(whopReason: string): BillingReason | string {
    const reasonMap: Record<string, BillingReason> = {
      subscription_create: BillingReason.SUBSCRIPTION_CREATE,
      subscription_cycle: BillingReason.SUBSCRIPTION_CYCLE,
      subscription_update: BillingReason.SUBSCRIPTION_UPDATE,
      manual: BillingReason.MANUAL,
    };

    return reasonMap[whopReason] || BillingReason.OTHER;
  }

  /**
   * Extract user ID from various Whop data structures
   */
  private static extractUserId(data: any): string {
    return (
      data.user?.id ||
      data.user_id ||
      data.membership?.user?.id ||
      data.membership?.user_id ||
      ''
    );
  }

  /**
   * Extract membership ID from various Whop data structures
   */
  private static extractMembershipId(data: any): string {
    return (
      data.membership?.id ||
      data.membership_id ||
      data.member?.id ||
      data.id ||
      ''
    );
  }
}
