export interface PlanInfoDto {
  id: string | null;
  title: string | null;
  billingPeriod: number;
  renewalPrice: number | null;
  currency: string;
  trialPeriodDays: number | null;
}

export interface RenewalItemDto {
  id: string;
  userId: string;
  email: string;
  plan: PlanInfoDto;
  nextRenewalDate: string | null;
  paidAt: string;
  amount: number | null;
  billingReason: string;
  membershipStatus: string | null; // Current status of the membership
}

export interface RenewalCountDto {
  count: number;
  emails: string[];
  renewals: RenewalItemDto[];
}

export interface RenewalStatsDto {
  total: number;
  // All Whop membership statuses
  trialing: number;
  active: number;
  past_due: number;
  completed: number;
  canceled: number;
  expired: number;
  unresolved: number;
  drafted: number;
  unknown: number; // For any status not in the list above
}

export interface RenewalsAnalysisDto {
  monthly: RenewalCountDto;
  yearly: RenewalCountDto;
  stats: RenewalStatsDto; // Breakdown by current membership status
}

export interface RenewalsResponseDto {
  analysis: RenewalsAnalysisDto;
}
