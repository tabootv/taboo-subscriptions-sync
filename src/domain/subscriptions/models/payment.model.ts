/**
 * Payment model
 *
 * Represents a payment transaction across all providers.
 * Normalized format for analyzing conversions, renewals, and revenue.
 */

/**
 * Payment status
 */
export enum PaymentStatus {
  SUCCEEDED = 'succeeded',
  PENDING = 'pending',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELED = 'canceled',
}

/**
 * Billing reason
 * Why the payment was charged
 */
export enum BillingReason {
  SUBSCRIPTION_CREATE = 'subscription_create', // First payment after trial
  SUBSCRIPTION_CYCLE = 'subscription_cycle', // Recurring renewal
  SUBSCRIPTION_UPDATE = 'subscription_update', // Plan change
  MANUAL = 'manual', // Manual charge
  OTHER = 'other',
}

/**
 * Unified payment model
 */
export interface Payment {
  /**
   * Unique payment identifier
   */
  id: string;

  /**
   * Related membership/subscription ID
   */
  membershipId: string;

  /**
   * User identifier
   */
  userId: string;

  /**
   * User email
   */
  email?: string;

  /**
   * Provider name
   */
  provider: string;

  /**
   * Payment amount
   */
  amount: number;

  /**
   * Currency code (ISO 4217)
   */
  currency: string;

  /**
   * Payment status
   */
  status: PaymentStatus | string;

  /**
   * Substatus (provider-specific detail)
   */
  substatus?: string;

  /**
   * Billing reason
   */
  billingReason: BillingReason | string;

  /**
   * Timestamps
   */
  createdAt: string;
  paidAt: string;
  refundedAt?: string;

  /**
   * Plan information at time of payment
   */
  plan?: {
    id: string;
    title?: string;
    billingPeriod?: number;
  };

  /**
   * Payment method
   */
  paymentMethod?: {
    type: string; // 'card', 'crypto', 'apple_pay', 'google_pay', etc.
    last4?: string;
    brand?: string;
  };

  /**
   * Provider-specific raw data
   */
  providerData?: Record<string, any>;

  /**
   * Metadata
   */
  metadata?: {
    [key: string]: any;
  };
}
