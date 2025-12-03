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
import { MembershipsQueryDto } from './dto/memberships-query.dto';
import { MembershipsResponseDto } from './dto/memberships-response.dto';
import { MembershipsService } from './memberships.service';

@Controller('analysis/whop/memberships')
@UseInterceptors(TimeoutInterceptor)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  @Timeout(300000) // 5min
  async analyzeMemberships(
    @Headers('authorization') auth: string,
    @Query() query: MembershipsQueryDto,
  ): Promise<MembershipsResponseDto> {
    if (!auth) {
      throw new UnauthorizedException('Authorization header required');
    }

    const { startDate, endDate } = this.parseDates(query);
    return this.membershipsService.analyzeMemberships(startDate, endDate);
  }

  /**
   * Parses startDate/endDate query parameters
   * Defaults to yesterday if not provided
   */
  private parseDates(query: MembershipsQueryDto): {
    startDate: Date;
    endDate: Date;
  } {
    const startDate = query.startDate
      ? new Date(query.startDate)
      : this.getYesterday();

    const endDate = query.endDate
      ? new Date(query.endDate)
      : this.getEndOfYesterday();

    return { startDate, endDate };
  }

  private getYesterday(): Date {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);
    return yesterday;
  }

  private getEndOfYesterday(): Date {
    const endOfYesterday = new Date();
    endOfYesterday.setUTCDate(endOfYesterday.getUTCDate() - 1);
    endOfYesterday.setUTCHours(23, 59, 59, 999);
    return endOfYesterday;
  }
}
