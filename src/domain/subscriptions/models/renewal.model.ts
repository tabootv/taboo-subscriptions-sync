/**
 * Renewal model
 *
 * Represents a subscription renewal event.
 * Used for analyzing recurring revenue and renewal patterns.
 */

import { PlanInfo } from './subscription.model';

/**
 * Renewal model
 */
export interface Renewal {
  /**
   * Membership identifier
   */
  id: string;

  /**
   * User identifier
   */
  userId: string;

  /**
   * User email
   */
  email: string;

  /**
   * Provider name
   */
  provider: string;

  /**
   * Plan information
   */
  plan: PlanInfo;

  /**
   * Next renewal date
   */
  nextRenewalDate: string;

  /**
   * Payment details for this renewal
   */
  paidAt: string;
  amount: number;
  currency: string;

  /**
   * Billing reason (typically 'subscription_cycle')
   */
  billingReason: string;

  /**
   * Membership status at renewal
   */
  membershipStatus: string;

  /**
   * Provider-specific data
   */
  providerData?: Record<string, any>;
}

/**
 * Renewal group (monthly/yearly)
 */
export interface RenewalGroup {
  count: number;
  emails: string[];
  renewals: Renewal[];
}
