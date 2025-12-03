/**
 * Providers Module
 *
 * Core module for provider registry functionality
 */

import { Global, Module } from '@nestjs/common';
import { ProviderRegistry } from './provider-registry.service';

@Global()
@Module({
  providers: [ProviderRegistry],
  exports: [ProviderRegistry],
})
export class ProvidersModule {}
