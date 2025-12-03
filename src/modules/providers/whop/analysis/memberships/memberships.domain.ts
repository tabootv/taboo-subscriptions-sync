import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ConversionClassification {
  isConversion: boolean;
  isNonConversion: boolean;
  hasPayment: boolean;
}

@Injectable()
export class MembershipsDomain {
  private readonly TRIAL_PERIOD_DAYS: number;

  constructor(private readonly configService: ConfigService) {
    this.TRIAL_PERIOD_DAYS = this.configService.get<number>('TRIAL_PERIOD_DAYS', 3);
  }

  /**
   * Verifies if a membership is trialing
   */
  isTrialing(membership: any): boolean {
    return membership.status === 'trialing';
  }

  /**
   * Verifies if a membership is active
   */
  isActive(membership: any): boolean {
    return membership.status === 'active' || membership.status === 'joined';
  }

  /**
   * Verifies if a membership is canceled/expired
   */
  isCanceled(membership: any): boolean {
    return membership.status === 'canceled' || membership.status === 'expired';
  }

  /**
   * Classifies if there was a conversion from trial to active
   */
  classifyConversion(
    trialMembership: any,
    activeMembership: any | null,
    payments: any[],
  ): ConversionClassification {
    const hasPayment = payments.some((p) =>
      this.isConversionPayment(p, trialMembership),
    );

    return {
      isConversion: !!activeMembership && hasPayment,
      isNonConversion: !activeMembership && !hasPayment,
      hasPayment,
    };
  }

  /**
   * Verifies if a payment indicates trial conversion
   */
  private isConversionPayment(payment: any, trialMembership: any): boolean {
    const billingReason = payment.billing_reason || payment.reason;

    // subscription_create always indicates conversion
    if (billingReason === 'subscription_create') {
      return true;
    }

    // subscription_cycle within trial window can also indicate conversion
    if (billingReason === 'subscription_cycle') {
      return this.isWithinTrialWindow(payment, trialMembership);
    }

    return false;
  }

  /**
   * Verifies if payment is within trial window
   */
  private isWithinTrialWindow(payment: any, trialMembership: any): boolean {
    const paidAt = payment.paid_at ? new Date(payment.paid_at) : null;
    const trialStart = trialMembership.created_at
      ? new Date(trialMembership.created_at)
      : null;

    if (!paidAt || !trialStart) return false;

    const daysDiff =
      (paidAt.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= this.TRIAL_PERIOD_DAYS;
  }

  /**
   * Extracts user ID from membership
   */
  extractUserId(membership: any): string | null {
    return (
      membership.user?.id ||
      membership.user_id ||
      membership.membership?.user?.id ||
      null
    );
  }

  /**
   * Extracts membership ID from membership
   */
  extractMembershipId(membership: any): string | null {
    return (
      membership.membership?.id ||
      membership.id ||
      membership.member?.id ||
      null
    );
  }
}
