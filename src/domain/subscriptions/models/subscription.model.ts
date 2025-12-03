/**
 * Unified subscription model
 *
 * Represents a subscription across all providers in a normalized format.
 * This is the core domain model that abstracts provider-specific details.
 */

/**
 * Subscription status enum
 * Normalized across all providers
 */
export enum SubscriptionStatus {
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  EXPIRED = 'expired',
  PAUSED = 'paused',
  UNPAID = 'unpaid',
}

/**
 * Plan information
 * Details about the subscription plan
 */
export interface PlanInfo {
  id: string;
  title: string | null;
  billingPeriod: number | null; // in days
  renewalPrice: number | null;
  currency: string;
  trialPeriodDays: number | null;
}

/**
 * Unified subscription model
 * Provider-agnostic representation of a subscription
 */
export interface Subscription {
  /**
   * Unique identifier (from provider)
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
   * Subscription status
   */
  status: SubscriptionStatus;

  /**
   * Provider name (e.g., 'whop', 'applepay')
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
  expiresAt?: string;

  /**
   * Trial information
   */
  trialEndsAt?: string;
  isTrialing: boolean;

  /**
   * Renewal information
   */
  nextRenewalDate?: string;
  renewalPeriodEnd?: string;

  /**
   * Cancellation details
   */
  cancellationReason?: string;

  /**
   * Provider-specific raw data
   * Stored for debugging and provider-specific features
   */
  providerData?: Record<string, any>;

  /**
   * Metadata
   */
  metadata?: {
    syncedAt?: string;
    lastCheckedAt?: string;
    [key: string]: any;
  };
}
