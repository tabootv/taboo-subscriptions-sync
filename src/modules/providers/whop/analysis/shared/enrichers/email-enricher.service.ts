import { Injectable } from '@nestjs/common';
import { logger } from '../../../../../../core/logger/logger.config';
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

@Injectable()
export class EmailEnricherService {
  private readonly logger = logger();

  constructor(private readonly whopApiClient: WhopApiClientService) {}

  async enrichMemberships(memberships: any[]): Promise<EnrichedMembership[]> {
    const enriched: EnrichedMembership[] = [];

    for (const membership of memberships) {
      let email = this.extractEmail(membership);

      if (!email || email === 'N/A') {
        const memberId = membership.member?.id || membership.membership?.member?.id;
        if (memberId) {
          try {
            const fullMember = await this.whopApiClient.getMember(memberId);
            email = this.extractEmail(fullMember) || 'N/A';
          } catch {
            email = 'N/A';
          }
        }
      }

      enriched.push({
        id: membership.id,
        userId: membership.user?.id || membership.user_id || '',
        email,
        status: membership.status,
        createdAt: membership.created_at || '',
        updatedAt: membership.updated_at || '',
        membership,
      });
    }

    this.logger.info({
      total: memberships.length,
      withEmail: enriched.filter((e) => e.email !== 'N/A').length,
    }, 'Emails enriched');

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
