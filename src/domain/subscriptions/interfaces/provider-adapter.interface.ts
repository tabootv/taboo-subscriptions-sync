/**
 * Base interface for all provider adapters
 *
 * Each payment provider (Whop, Apple Pay, Google Pay, etc.) must implement
 * this interface to integrate with the subscription analysis system.
 *
 * The interface defines the minimum contract that all providers must support,
 * while allowing flexibility for provider-specific features through additional methods.
 */

import { Membership } from '../models/membership.model';
import { Payment } from '../models/payment.model';
import { Renewal } from '../models/renewal.model';

/**
 * Filters for fetching memberships
 */
export interface MembershipFilters {
  startDate: Date;
  endDate: Date;
  statuses?: string[];
  limit?: number;
  cursor?: string;
}

/**
 * Filters for fetching payments
 */
export interface PaymentFilters {
  startDate: Date;
  endDate: Date;
  billingReasons?: string[];
  substatuses?: string[];
  limit?: number;
  cursor?: string;
}

/**
 * Filters for fetching renewals
 */
export interface RenewalFilters {
  startDate: Date;
  endDate: Date;
  statuses?: string[];
  limit?: number;
  cursor?: string;
}

/**
 * Provider capabilities metadata
 * Describes what features the provider supports
 */
export interface ProviderCapabilities {
  supportsTrials: boolean;
  supportsRenewals: boolean;
  supportsRefunds: boolean;
  supportedCurrencies: string[];
  supportedBillingPeriods: number[]; // in days (e.g., 30, 365)
}

/**
 * Base interface that all provider adapters must implement
 */
export interface ProviderAdapter {
  /**
   * Unique identifier for the provider (e.g., 'whop', 'applepay', 'googlepay')
   */
  readonly providerName: string;

  /**
   * Fetch memberships from the provider
   * @param filters - Filters to apply to the query
   * @returns Array of normalized membership objects
   */
  getMemberships(filters: MembershipFilters): Promise<Membership[]>;

  /**
   * Fetch payments from the provider
   * @param filters - Filters to apply to the query
   * @returns Array of normalized payment objects
   */
  getPayments(filters: PaymentFilters): Promise<Payment[]>;

  /**
   * Fetch renewals from the provider
   * @param filters - Filters to apply to the query
   * @returns Array of normalized renewal objects
   */
  getRenewals(filters: RenewalFilters): Promise<Renewal[]>;

  /**
   * Get provider capabilities
   * @returns Metadata about what features this provider supports
   */
  getCapabilities(): ProviderCapabilities;

  /**
   * Check if the provider is healthy and responding
   * @returns true if provider API is accessible and responding
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get provider-specific data (optional)
   * Providers can implement additional methods beyond this interface
   */
  [key: string]: any;
}
