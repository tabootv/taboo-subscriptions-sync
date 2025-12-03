/**
 * Consolidated Analysis Controller
 *
 * Provides unified API endpoints that aggregate data from all payment providers.
 * Clients can query subscription/membership data across multiple providers in a single request.
 */

import {
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import { Timeout } from '../../../core/timeout/timeout.decorator';
import { TimeoutInterceptor } from '../../../core/timeout/timeout.interceptor';
import { ConsolidatedAnalysisQueryDto } from '../dto/consolidated-analysis-query.dto';
import { ConsolidatedAnalysisResponseDto } from '../dto/consolidated-analysis-response.dto';
import { ConsolidatedAnalysisService } from '../services/consolidated-analysis.service';

@Controller('consolidated/analysis')
@UseInterceptors(TimeoutInterceptor)
export class ConsolidatedAnalysisController {
  constructor(
    private readonly consolidatedAnalysisService: ConsolidatedAnalysisService,
  ) {}

  /**
   * GET /api/consolidated/analysis
   *
   * Analyze subscriptions/memberships across all providers
   *
   * Query Parameters:
   * - providers: Comma-separated list of provider names (optional, default: all)
   * - startDate: Start date in ISO 8601 format (optional, default: yesterday 00:00:00 UTC)
   * - endDate: End date in ISO 8601 format (optional, default: yesterday 23:59:59 UTC)
   * - status: Filter by status (optional)
   *
   * Response:
   * Returns analysis data grouped by provider. Each provider's data includes
   * memberships (trials, converted, not converted) and renewals (monthly, yearly).
   * If a provider fails, it returns an error object instead of data.
   *
   * Example:
   * GET /api/consolidated/analysis?startDate=2025-12-01T00:00:00Z&endDate=2025-12-01T23:59:59Z
   *
   * Response:
   * {
   *   "period": {
   *     "startDate": "2025-12-01T00:00:00.000Z",
   *     "endDate": "2025-12-01T23:59:59.999Z"
   *   },
   *   "providers": {
   *     "whop": {
   *       "success": true,
   *       "data": { ... },
   *       "metadata": { ... }
   *     },
   *     "applepay": {
   *       "success": false,
   *       "error": { "message": "Provider not available" }
   *     }
   *   },
   *   "metadata": {
   *     "totalProcessingTime": 1234,
   *     "providersIncluded": 2,
   *     "providersSucceeded": 1,
   *     "providersFailed": 1
   *   }
   * }
   */
  @Get()
  @Timeout(600000) // 10min timeout (analyzing multiple providers can take time)
  async analyzeConsolidated(
    @Headers('authorization') auth: string,
    @Query() query: ConsolidatedAnalysisQueryDto,
  ): Promise<ConsolidatedAnalysisResponseDto> {
    // Authentication check
    if (!auth) {
      throw new UnauthorizedException('Authorization header required');
    }

    // Parse dates
    const { startDate, endDate } = this.parseDates(query);

    // Parse providers (if specified)
    const providers = query.providers
      ? query.providers.split(',').map((p) => p.trim())
      : undefined;

    // Execute consolidated analysis
    return this.consolidatedAnalysisService.analyzeAll(
      startDate,
      endDate,
      providers,
      query.status,
    );
  }

  /**
   * Parse startDate/endDate from query parameters
   * Defaults to yesterday if not provided
   */
  private parseDates(query: ConsolidatedAnalysisQueryDto): {
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

  /**
   * Get yesterday at 00:00:00 UTC
   */
  private getYesterday(): Date {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);
    return yesterday;
  }

  /**
   * Get yesterday at 23:59:59 UTC
   */
  private getEndOfYesterday(): Date {
    const endOfYesterday = new Date();
    endOfYesterday.setUTCDate(endOfYesterday.getUTCDate() - 1);
    endOfYesterday.setUTCHours(23, 59, 59, 999);
    return endOfYesterday;
  }
}
