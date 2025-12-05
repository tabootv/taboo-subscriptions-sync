import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const VALID_MEMBERSHIP_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'completed',
  'canceled',
  'expired',
  'unresolved',
  'drafted',
] as const;

export type MembershipStatus = (typeof VALID_MEMBERSHIP_STATUSES)[number];

export class RenewalsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Transform(({ value }) => (value ? Number.parseInt(value, 10) : undefined))
  month?: number;

  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2100)
  @Transform(({ value }) => (value ? Number.parseInt(value, 10) : undefined))
  year?: number;

  /**
   * Filter by membership status
   * Can be a single status or comma-separated list
   * Example: ?status=active or ?status=active,canceled
   * Valid values: trialing, active, past_due, completed, canceled, expired, unresolved, drafted
   */
  @IsOptional()
  @IsArray()
  @IsIn(VALID_MEMBERSHIP_STATUSES, { each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    return value.split(',').map((s: string) => s.trim());
  })
  status?: MembershipStatus[];
}
