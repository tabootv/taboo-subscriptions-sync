import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { AppController } from './app.controller';
import { CoreModule } from './core/core.module';
import { ConsolidatedModule } from './modules/consolidated/consolidated.module';
import { HealthModule } from './modules/health/health.module';
import { WhopModule } from './modules/providers/whop/whop.module';

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
