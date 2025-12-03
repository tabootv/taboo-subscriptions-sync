import { Module } from '@nestjs/common';

import { RenewalsController } from './renewals/renewals.controller';
import { RenewalsDomain } from './renewals/renewals.domain';
import { RenewalsService } from './renewals/renewals.service';

import { MembershipsController } from './memberships/memberships.controller';
import { MembershipsDomain } from './memberships/memberships.domain';
import { MembershipsService } from './memberships/memberships.service';

import { PlanCacheService } from './shared/cache/plan-cache.service';
import { EmailEnricherService } from './shared/enrichers/email-enricher.service';
import { MembershipFetcherService } from './shared/fetchers/membership-fetcher.service';
import { PaymentFetcherService } from './shared/fetchers/payment-fetcher.service';

import { WhopApiClientService } from '../adapters/whop-api-client.service';

@Module({
  controllers: [RenewalsController, MembershipsController],
  providers: [
    RenewalsService,
    RenewalsDomain,
    MembershipsService,
    MembershipsDomain,
    PlanCacheService,
    PaymentFetcherService,
    MembershipFetcherService,
    EmailEnricherService,
    WhopApiClientService,
  ],
  exports: [RenewalsService, MembershipsService],
})
export class AnalysisModule {}
