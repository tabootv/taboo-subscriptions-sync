/**
 * Query DTO for consolidated analysis endpoint
 */

import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ConsolidatedAnalysisQueryDto {
  /**
   * Comma-separated list of providers to include
   * If not provided, includes all active providers
   *
   * @example "whop,applepay"
   */
  @IsOptional()
  @IsString()
  providers?: string;

  /**
   * Start date (ISO 8601 format)
   * Default: yesterday 00:00:00 UTC
   *
   * @example "2025-12-01T00:00:00Z"
   */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /**
   * End date (ISO 8601 format)
   * Default: yesterday 23:59:59 UTC
   *
   * @example "2025-12-01T23:59:59Z"
   */
  @IsOptional()
  @IsDateString()
  endDate?: string;

  /**
   * Filter by membership/subscription status
   * Comma-separated list
   *
   * @example "active,trialing"
   */
  @IsOptional()
  @IsString()
  status?: string;
}
