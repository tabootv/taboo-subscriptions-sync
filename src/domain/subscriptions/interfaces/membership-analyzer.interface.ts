/**
 * Interface for membership analysis strategies
 *
 * Different providers may require different analysis logic
 * (e.g., trial detection, conversion tracking)
 *
 * This interface allows provider-specific analyzers while maintaining
 * a consistent contract for the consolidated service.
 */

import { Membership } from '../models/membership.model';
import { Payment } from '../models/payment.model';

/**
 * Options for membership analysis
 */
export interface AnalysisOptions {
  /**
   * Number of days considered as trial period
   * @default 3
   */
  trialPeriodDays?: number;

  /**
   * Whether to enrich memberships with email data
   * @default true
   */
  enrichWithEmails?: boolean;

  /**
   * Whether to fetch and analyze plan information
   * @default true
   */
  includePlanInfo?: boolean;
}

/**
 * Result of membership analysis
 */
export interface MembershipAnalysis {
  /**
   * Memberships currently in trial
   */
  trials: Membership[];

  /**
   * Memberships that converted from trial to paid
   */
  converted: ConvertedMembership[];

  /**
   * Memberships that did not convert (canceled during trial)
   */
  notConverted: NotConvertedMembership[];

  /**
   * First payments in the period
   */
  firstPaid: FirstPaidMembership[];

  /**
   * Analysis metadata
   */
  metadata: {
    period: {
      startDate: string;
      endDate: string;
    };
    counts: {
      total: number;
      trials: number;
      converted: number;
      notConverted: number;
      firstPaid: number;
    };
    processingTime?: number;
  };
}

/**
 * Membership that converted from trial
 */
export interface ConvertedMembership extends Membership {
  convertedAt: string;
  firstPayment: {
    id: string;
    amount: number;
    currency: string;
    paidAt: string;
  };
}

/**
 * Membership that did not convert
 */
export interface NotConvertedMembership extends Membership {
  canceledAt: string;
  cancellationReason?: string;
  trialEndsAt?: string;
  daysInTrial?: number;
}

/**
 * First paid membership
 */
export interface FirstPaidMembership {
  id: string;
  userId: string;
  email: string;
  paidAt: string;
  amount: number;
  currency: string;
}

/**
 * Interface for membership analyzer implementations
 */
export interface MembershipAnalyzer {
  /**
   * Analyze memberships to identify trials, conversions, and non-conversions
   *
   * @param memberships - Array of memberships to analyze
   * @param payments - Array of related payments
   * @param options - Analysis options
   * @returns Analysis results
   */
  analyzeMemberships(
    memberships: Membership[],
    payments: Payment[],
    options?: AnalysisOptions,
  ): Promise<MembershipAnalysis>;

  /**
   * Identify which memberships converted from trial to paid
   *
   * @param memberships - Active memberships
   * @param payments - Payments in the period
   * @returns Converted memberships
   */
  identifyConversions(
    memberships: Membership[],
    payments: Payment[],
  ): Promise<ConvertedMembership[]>;

  /**
   * Identify which memberships did not convert
   *
   * @param memberships - Canceled/expired memberships
   * @param payments - Payments in the period
   * @returns Non-converted memberships
   */
  identifyNonConversions(
    memberships: Membership[],
    payments: Payment[],
  ): Promise<NotConvertedMembership[]>;
}
