/**
 * Membership model
 *
 * Represents a user's membership/subscription in the system.
 * This is used for analysis of trials, conversions, and active subscriptions.
 */

import { PlanInfo, SubscriptionStatus } from './subscription.model';

/**
 * Membership model (extends/simplifies Subscription for analysis purposes)
 */
export interface Membership {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * User identifier
   */
  userId: string;

  /**
   * User email
   */
  email: string | null;

  /**
   * Membership status
   */
  status: SubscriptionStatus | string;

  /**
   * Provider name
   */
  provider: string;

  /**
   * Plan information
   */
  plan: PlanInfo | null;

  /**
   * Timestamps
   */
  createdAt: string;
  updatedAt?: string;
  canceledAt?: string;

  /**
   * Trial information
   */
  trialEndsAt?: string;

  /**
   * Renewal information
   */
  renewalPeriodEnd?: string;

  /**
   * Cancellation details
   */
  cancellationReason?: string;

  /**
   * Provider-specific raw data
   */
  providerData?: Record<string, any>;
}

/**
 * Enriched membership with email
 * Used during analysis when emails have been fetched
 */
export interface EnrichedMembership extends Membership {
  email: string;
  membership?: any; // Raw provider membership object
}
