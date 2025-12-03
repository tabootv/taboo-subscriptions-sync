import { IsDateString, IsOptional } from 'class-validator';

export class MembershipsQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
