import { Module } from '@nestjs/common';
import { CoreModule } from '../../../../core/core.module';

/**
 * Module específico de Memberships do Whop
 * Quando adicionar outros provedores (Stripe, PayPal, etc),
 * cada um terá seu próprio module de memberships
 */
@Module({
  imports: [CoreModule],
  providers: [],
  controllers: [],
  exports: [],
})
export class WhopMembershipsModule {}
