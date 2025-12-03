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

/**
 * Whop Module - Contains everything related to Whop provider
 *
 * Structure:
 * - Adapters: WhopAdapter (implements ProviderAdapter)
 * - Controllers: Backfill, Reconciliation
 * - Services: Reconciliation, API Client
 * - Sub-modules: Memberships, Payments, Plans, Analysis (isolated)
 *
 * This module automatically registers the WhopAdapter with the ProviderRegistry
 * on initialization, making Whop available to the consolidated services.
 */
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

  /**
   * Register Whop adapter with the provider registry on module initialization
   */
  onModuleInit() {
    this.providerRegistry.registerProvider('whop', this.whopAdapter, true);
  }
}
