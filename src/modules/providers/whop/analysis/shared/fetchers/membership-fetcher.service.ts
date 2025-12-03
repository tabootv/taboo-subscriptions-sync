import { Injectable } from '@nestjs/common';
import { logger } from '../../../../../../core/logger/logger.config';
import { WhopApiClientService } from '../../../adapters/whop-api-client.service';

@Injectable()
export class MembershipFetcherService {
  private readonly logger = logger();
  private readonly MAX_PAGES = 200;

  constructor(private readonly whopApiClient: WhopApiClientService) {}

  async fetchByStatus(
    status: string | string[],
    startDate: Date,
    endDate: Date,
  ): Promise<any[]> {
    const statuses = Array.isArray(status) ? status : [status];
    const allMemberships: any[] = [];

    for (const statusValue of statuses) {
      let cursor: string | null = null;
      let hasNextPage = true;
      let pageCount = 0;

      while (hasNextPage && pageCount < this.MAX_PAGES) {
        const response = await this.whopApiClient.getMemberships({
          statuses: [statusValue],
          created_after: startDate.toISOString(),
          created_before: endDate.toISOString(),
          cursor,
        });

        const memberships = response.data || response.memberships || response || [];
        if (Array.isArray(memberships) && memberships.length > 0) {
          allMemberships.push(...memberships);
        }

        const pageInfo = response.page_info || response.pagination;
        if (pageInfo) {
          hasNextPage = pageInfo.has_next_page === true;
          cursor = pageInfo.end_cursor || null;
        } else {
          hasNextPage = Array.isArray(memberships) && memberships.length >= 100;
          cursor = null;
        }

        pageCount++;
      }
    }

    const uniqueMemberships = Array.from(
      new Map(allMemberships.map((m) => [m.id, m])).values(),
    );

    this.logger.info({
      statuses,
      total: uniqueMemberships.length,
    }, 'Memberships fetched');

    return uniqueMemberships;
  }
}
