import { Injectable } from '@nestjs/common';

export interface RenewalClassification {
  isMonthly: boolean;
  isYearly: boolean;
  billingPeriod: number;
  nextRenewalDate: Date | null;
}

@Injectable()
export class RenewalsDomain {
  /**
   * Classifies a payment as monthly or yearly renewal
   * Based on billing_period from plan
   */
  classifyRenewal(payment: any, plan: any): RenewalClassification {
    const billingPeriod = this.extractBillingPeriod(payment, plan);
    const paidAt = payment.paid_at ? new Date(payment.paid_at) : null;
    const nextRenewalDate = paidAt
      ? new Date(paidAt.getTime() + billingPeriod * 24 * 60 * 60 * 1000)
      : null;

    return {
      isMonthly: billingPeriod > 0 && billingPeriod <= 45,
      isYearly: billingPeriod > 45,
      billingPeriod,
      nextRenewalDate,
    };
  }

  /**
   * Extracts billing period (prioritizes plan.billing_period)
   */
  private extractBillingPeriod(payment: any, plan: any): number {
    if (plan?.billing_period) {
      return plan.billing_period;
    }

    const interval = payment.interval || payment.plan?.interval;
    const intervalCount =
      payment.interval_count || payment.plan?.interval_count || 1;

    if (interval === 'year' || interval === 'annual') {
      return 365;
    }
    if (interval === 'month' || interval === 'monthly') {
      return 30 * intervalCount;
    }

    return 30;
  }

  /**
   * Verifies if a membership is active
   */
  isActiveMembership(membership: any): boolean {
    const status = membership?.status || membership?.membership?.status;
    return status === 'active' || status === 'joined';
  }

  /**
   * Extracts membership ID from payment
   */
  extractMembershipId(payment: any): string | null {
    return (
      payment.membership?.id ||
      payment.membership_id ||
      payment.member?.id ||
      payment.member_id ||
      null
    );
  }

  /**
   * Extracts current membership status from payment
   */
  extractMembershipStatus(payment: any): string | null {
    return payment.membership?.status || payment.status || null;
  }
}
