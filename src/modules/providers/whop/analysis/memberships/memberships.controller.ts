import {
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import { logger } from '../../../../../core/logger/logger.config';
import { Timeout } from '../../../../../core/timeout/timeout.decorator';
import { TimeoutInterceptor } from '../../../../../core/timeout/timeout.interceptor';
import { MembershipsQueryDto } from './dto/memberships-query.dto';
import { MembershipsResponseDto } from './dto/memberships-response.dto';
import { MembershipsService } from './memberships.service';

@Controller('analysis/whop/memberships')
@UseInterceptors(TimeoutInterceptor)
export class MembershipsController {
  private readonly logger = logger();

  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  @Timeout(300000)
  async analyzeMemberships(
    @Headers('authorization') auth: string,
    @Query() query: MembershipsQueryDto,
  ): Promise<MembershipsResponseDto> {
    if (!auth) {
      throw new UnauthorizedException('Authorization header required');
    }

    try {
      const { startDate, endDate } = this.parseDates(query);
      const result = await this.membershipsService.analyzeMemberships(
        startDate,
        endDate,
      );

      this.logger.info(
        {
          trials: result.analysis.trials.length,
          converted: result.analysis.converted.length,
          notConverted: result.analysis.notConverted.length,
          firstPaid: result.analysis.firstPaid.length,
        },
        'Returning memberships analysis response',
      );

      const responseSize = JSON.stringify(result).length;
      this.logger.info(
        { responseSizeBytes: responseSize },
        'Response size calculated, sending response',
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        {
          error: error.message,
          stack: error.stack,
        },
        'Error in analyzeMemberships',
      );
      throw error;
    }
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
