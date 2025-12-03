/**
 * Interface for renewal analysis strategies
 *
 * Analyzes recurring payments and subscription renewals.
 * Different providers may have different renewal patterns and billing cycles.
 */

import { Payment } from '../models/payment.model';
import { Renewal } from '../models/renewal.model';

/**
 * Options for renewal analysis
 */
export interface RenewalAnalysisOptions {
  /**
   * Whether to group renewals by billing period (monthly/yearly)
   * @default true
   */
  groupByBillingPeriod?: boolean;

  /**
   * Whether to include statistics in the analysis
   * @default true
   */
  includeStats?: boolean;

  /**
   * Filter by specific status
   */
  status?: string | string[];
}

/**
 * Renewal statistics
 */
export interface RenewalStats {
  total: number;
  active: number;
  canceled: number;
  expired: number;
  past_due: number;
  [status: string]: number; // Allow dynamic status counts
}

/**
 * Result of renewal analysis
 */
export interface RenewalAnalysis {
  /**
   * Monthly renewals (billing period ~30 days)
   */
  monthly: {
    count: number;
    emails: string[];
    renewals: Renewal[];
  };

  /**
   * Yearly renewals (billing period ~365 days)
   */
  yearly: {
    count: number;
    emails: string[];
    renewals: Renewal[];
  };

  /**
   * Statistics by status
   */
  stats: RenewalStats;

  /**
   * Analysis metadata
   */
  metadata: {
    period: {
      startDate: string;
      endDate: string;
    };
    processingTime?: number;
    recordsProcessed: number;
  };
}

/**
 * Interface for renewal analyzer implementations
 */
export interface RenewalAnalyzer {
  /**
   * Analyze renewals in a given period
   *
   * @param payments - Payments with billing_reason = 'subscription_cycle'
   * @param options - Analysis options
   * @returns Renewal analysis results
   */
  analyzeRenewals(
    payments: Payment[],
    options?: RenewalAnalysisOptions,
  ): Promise<RenewalAnalysis>;

  /**
   * Classify renewals by billing period
   *
   * @param renewals - Array of renewals
   * @returns Renewals grouped by period (monthly/yearly)
   */
  groupByBillingPeriod(renewals: Renewal[]): {
    monthly: Renewal[];
    yearly: Renewal[];
  };

  /**
   * Calculate renewal statistics
   *
   * @param renewals - Array of renewals
   * @returns Statistics by status
   */
  calculateStats(renewals: Renewal[]): RenewalStats;
}
