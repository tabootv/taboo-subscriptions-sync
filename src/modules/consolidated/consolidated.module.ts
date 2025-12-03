import { Module } from '@nestjs/common';
import { CoreModule } from '../../core/core.module';
import { WhopModule } from '../providers/whop/whop.module';
import { ConsolidatedAnalysisController } from './controllers/consolidated-analysis.controller';
import { ConsolidatedAnalysisService } from './services/consolidated-analysis.service';

/**
 * Consolidated Module - Aggregates data from all providers
 *
 * This module provides a unified interface for:
 * - Memberships/Subscriptions from all providers (Whop, Apple Pay, Google Pay, etc)
 * - Payments from all providers
 * - Renewals/Billing cycles
 * - Consolidated metrics
 *
 * The consolidated API automatically includes all active providers
 * registered in ProviderRegistry. When a new provider is added:
 * 1. Create provider module in src/modules/providers/{provider}/
 * 2. Implement {Provider}Adapter extending ProviderAdapter
 * 3. Import module in AppModule
 * 4. ConsolidatedAnalysisService will automatically include the provider
 *
 * Endpoints:
 * - GET /api/consolidated/analysis - Consolidated analysis from all providers
 */
@Module({
  imports: [CoreModule, WhopModule],
  providers: [ConsolidatedAnalysisService],
  controllers: [ConsolidatedAnalysisController],
  exports: [ConsolidatedAnalysisService],
})
export class ConsolidatedModule {}
