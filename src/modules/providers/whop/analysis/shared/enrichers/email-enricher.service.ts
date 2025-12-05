import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { logger } from '../../../../../../core/logger/logger.config';
import {
  batchProcessWithLimit,
  deduplicateItems,
} from '../../../../../../core/utils';
import { WhopApiClientService } from '../../../adapters/whop-api-client.service';

export interface EnrichedMembership {
  id: string;
  userId: string;
  email: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  membership: any;
}

interface MembershipToEnrich {
  membership: any;
  email: string | null;
  memberId: string | null;
}

@Injectable()
export class EmailEnricherService {
  private readonly logger = logger();
  private readonly concurrencyLimit: number;
  private readonly batchDelayMs: number;

  constructor(
    private readonly whopApiClient: WhopApiClientService,
    private readonly configService: ConfigService,
  ) {
    this.concurrencyLimit = this.configService.get<number>(
      'WHOP_API_CONCURRENCY',
      1,
    );
    this.batchDelayMs = this.configService.get<number>(
      'WHOP_API_BATCH_DELAY_MS',
      2000,
    );
  }

  async enrichMemberships(memberships: any[]): Promise<EnrichedMembership[]> {
    if (memberships.length === 0) {
      return [];
    }

    const startTime = Date.now();

    const membershipsToProcess: MembershipToEnrich[] = memberships.map(
      (membership) => {
        const email = this.extractEmail(membership);
        const memberId =
          membership.member?.id || membership.membership?.member?.id;

        return {
          membership,
          email,
          memberId,
        };
      },
    );

    const memberIdsToFetch = membershipsToProcess
      .filter(
        (item): item is typeof item & { memberId: string } =>
          (!item.email || item.email === 'N/A') && !!item.memberId,
      )
      .map((item) => item.memberId);

    const uniqueMemberIds = deduplicateItems(memberIdsToFetch, (id) => id);

    this.logger.debug(
      {
        totalMemberships: memberships.length,
        needsEnrichment: memberIdsToFetch.length,
        uniqueMembers: uniqueMemberIds.length,
      },
      'Starting email enrichment',
    );

    const memberCache = new Map<string, string>();

    if (uniqueMemberIds.length > 0) {
      let currentDelay = this.batchDelayMs;

      const fetchResults = await batchProcessWithLimit(
        uniqueMemberIds,
        async (memberId) => {
          try {
            const fullMember = await this.whopApiClient.getMember(memberId);
            const email = this.extractEmail(fullMember) || 'N/A';
            return { memberId, email, isRateLimit: false };
          } catch (error: any) {
            const isRateLimit =
              error?.response?.status === 429 ||
              error?.message?.includes('Rate limit') ||
              error?.message?.includes('429');

            this.logger.warn(
              { memberId, error: (error as Error).message },
              'Failed to fetch member email',
            );
            return { memberId, email: 'N/A', isRateLimit };
          }
        },
        {
          concurrencyLimit: this.concurrencyLimit,
          delayBetweenBatches: (rateLimitCount = 0) => {
            if (rateLimitCount > 0) {
              currentDelay = Math.min(
                currentDelay * (1 + rateLimitCount * 0.5),
                this.batchDelayMs * 5,
              );
            } else {
              currentDelay = Math.max(currentDelay * 0.95, this.batchDelayMs);
            }
            return currentDelay;
          },
          throwOnError: false,
        },
      );

      fetchResults.forEach((result) => {
        if (result.success) {
          const value = result.value as any;
          memberCache.set(value.memberId, value.email);
        }
      });

      this.logger.debug(
        {
          cached: memberCache.size,
          successful: fetchResults.filter((r) => r.success).length,
          failed: fetchResults.filter((r) => !r.success).length,
        },
        'Member data fetched',
      );
    }

    const enriched: EnrichedMembership[] = membershipsToProcess.map((item) => {
      let finalEmail = item.email || 'N/A';

      if ((!finalEmail || finalEmail === 'N/A') && item.memberId) {
        finalEmail = memberCache.get(item.memberId) || 'N/A';
      }

      return {
        id: item.membership.id,
        userId: item.membership.user?.id || item.membership.user_id || '',
        email: finalEmail,
        status: item.membership.status,
        createdAt: item.membership.created_at || '',
        updatedAt: item.membership.updated_at || '',
        membership: item.membership,
      };
    });

    const duration = Date.now() - startTime;
    const withEmail = enriched.filter((e) => e.email !== 'N/A').length;

    this.logger.info(
      {
        total: memberships.length,
        withEmail,
        withoutEmail: memberships.length - withEmail,
        apiCalls: uniqueMemberIds.length,
        durationMs: duration,
        avgTimePerCall:
          uniqueMemberIds.length > 0
            ? Math.round(duration / uniqueMemberIds.length)
            : 0,
      },
      'Emails enriched',
    );

    return enriched;
  }

  private extractEmail(obj: any): string | null {
    return (
      obj?.user?.email ||
      obj?.email ||
      obj?.customer?.email ||
      obj?.member?.email ||
      null
    );
  }
}
