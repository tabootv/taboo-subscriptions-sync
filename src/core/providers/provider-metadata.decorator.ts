/**
 * Decorator for marking provider adapters
 *
 * Usage:
 * @Injectable()
 * @ProviderMetadata({ name: 'whop', displayName: 'Whop' })
 * export class WhopAdapter implements ProviderAdapter { ... }
 */

import { SetMetadata } from '@nestjs/common';
import { ProviderMetadataOptions } from './provider.types';

/**
 * Metadata key for storing provider information
 */
export const PROVIDER_METADATA_KEY = 'provider:metadata';

/**
 * Decorator to mark a class as a provider adapter
 *
 * @param options - Provider metadata options
 */
export const ProviderMetadata = (options: ProviderMetadataOptions) => {
  return SetMetadata(PROVIDER_METADATA_KEY, options);
};
