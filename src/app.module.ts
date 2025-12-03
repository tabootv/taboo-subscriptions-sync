import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { AppController } from './app.controller';
import { CoreModule } from './core/core.module';
import { ConsolidatedModule } from './modules/consolidated/consolidated.module';
import { HealthModule } from './modules/health/health.module';
import { WhopModule } from './modules/providers/whop/whop.module';

/**
 * AppModule - Application root module
 *
 * Multi-Provider Architecture:
 * - providers/whop/: Whop provider module (analysis, backfill, memberships, payments, plans)
 * - providers/applepay/: (Future) Apple Pay provider module
 * - providers/googlepay/: (Future) Google Pay provider module
 * - ConsolidatedModule: Aggregates data from all providers (unified interface)
 * - MetricsModule: Consolidated metrics from all providers
 * - HealthModule: System health check
 *
 * When adding new providers:
 * 1. Create provider module in src/modules/providers/{provider}/
 * 2. Implement {Provider}Adapter extending ProviderAdapter
 * 3. Import module here
 * 4. Provider will be automatically registered in ProviderRegistry
 * 5. ConsolidatedModule will automatically include the new provider
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    CoreModule,
    ScheduleModule.forRoot(),
    TerminusModule,
    WhopModule,
    ConsolidatedModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
