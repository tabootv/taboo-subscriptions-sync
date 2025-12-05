import { Module, OnModuleInit } from '@nestjs/common';
import { CoreModule } from '../../../core/core.module';
import { ProviderRegistry } from '../../../core/providers';
import { WhopAdapter } from './adapters/whop-adapter.service';
import { WhopApiClientService } from './adapters/whop-api-client.service';
import { AnalysisModule } from './analysis/analysis.module';
import { WhopBackfillController } from './controllers/whop-backfill.controller';
import { WhopReconciliationController } from './controllers/whop-reconciliation.controller';
import { WhopMembershipsModule } from './memberships/whop-memberships.module';
import { WhopPaymentsModule } from './payments/whop-payments.module';
import { WhopPlansModule } from './plans/whop-plans.module';
import { ReconciliationService } from './services/reconciliation.service';

@Module({
  imports: [
    CoreModule,
    WhopMembershipsModule,
    WhopPaymentsModule,
    WhopPlansModule,
    AnalysisModule,
  ],
  controllers: [WhopBackfillController, WhopReconciliationController],
  providers: [ReconciliationService, WhopApiClientService, WhopAdapter],
  exports: [
    WhopApiClientService,
    WhopAdapter,
    ReconciliationService,
    WhopMembershipsModule,
    WhopPaymentsModule,
    WhopPlansModule,
    AnalysisModule,
  ],
})
export class WhopModule implements OnModuleInit {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly whopAdapter: WhopAdapter,
  ) {}

  onModuleInit() {
    this.providerRegistry.registerProvider('whop', this.whopAdapter, true);
  }
}
