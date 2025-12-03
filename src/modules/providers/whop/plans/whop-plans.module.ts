import { Module } from '@nestjs/common';
import { CoreModule } from '../../../../core/core.module';

/**
 * Module específico de Plans do Whop
 * Quando adicionar outros provedores (Stripe, PayPal, etc),
 * cada um terá seu próprio module de plans
 */
@Module({
  imports: [CoreModule],
  providers: [],
  controllers: [],
  exports: [],
})
export class WhopPlansModule {}
