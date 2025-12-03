export interface PlanInfoDto {
  id: string | null;
  title: string | null;
  billingPeriod: number | null;
  renewalPrice: number | null;
  currency: string | null;
  trialPeriodDays: number | null;
}

export interface TrialItemDto {
  id: string;
  userId: string;
  email: string;
  createdAt: string;
  status: string;
  plan: PlanInfoDto | null;
  trialEndsAt: string | null;
}

export interface ConvertedItemDto {
  id: string;
  userId: string;
  email: string;
  convertedAt: string;
  plan: PlanInfoDto | null;
  firstPayment: any;
}

export interface NotConvertedItemDto {
  id: string;
  userId: string;
  email: string;
  status: string; // 'canceled' | 'expired'
  createdAt: string;
  canceledAt: string;
  cancellationReason: string | null;
  plan: PlanInfoDto | null;
  trialEndsAt: string | null;
  daysInTrial: number | null;
}

export interface FirstPaidItemDto {
  id: string;
  userId: string;
  email: string;
  paidAt: string;
  amount: number | null;
  currency: string;
}

export interface MembershipsAnalysisDto {
  trials: TrialItemDto[];
  converted: ConvertedItemDto[];
  notConverted: NotConvertedItemDto[];
  firstPaid: FirstPaidItemDto[];
}

export interface MembershipsResponseDto {
  analysis: MembershipsAnalysisDto;
}
