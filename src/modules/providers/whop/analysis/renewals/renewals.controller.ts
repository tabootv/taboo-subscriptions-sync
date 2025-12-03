import {
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import { Timeout } from '../../../../../core/timeout/timeout.decorator';
import { TimeoutInterceptor } from '../../../../../core/timeout/timeout.interceptor';
import { RenewalsQueryDto } from './dto/renewals-query.dto';
import { RenewalsResponseDto } from './dto/renewals-response.dto';
import { RenewalsService } from './renewals.service';

@Controller('analysis/whop/renewals')
@UseInterceptors(TimeoutInterceptor)
export class RenewalsController {
  constructor(private readonly renewalsService: RenewalsService) {}

  @Get()
  @Timeout(300000) // 5min
  async getRenewals(
    @Headers('authorization') auth: string,
    @Query() query: RenewalsQueryDto,
  ): Promise<RenewalsResponseDto> {
    if (!auth) {
      throw new UnauthorizedException('Authorization header required');
    }

    const { startDate, endDate } = this.parseDates(query);
    return this.renewalsService.getRenewalsForPeriod(
      startDate,
      endDate,
      query.status, // Pass status filter
    );
  }

  /**
   * Parses month/year query parameters into start/end dates
   */
  private parseDates(query: RenewalsQueryDto): {
    startDate: Date;
    endDate: Date;
  } {
    const now = new Date();
    const year = query.year ?? now.getUTCFullYear();
    const month = query.month ?? now.getUTCMonth() + 1;

    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    return { startDate, endDate };
  }
}
