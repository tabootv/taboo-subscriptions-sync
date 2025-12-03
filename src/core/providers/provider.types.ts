/**
 * Core types for provider system
 */

import { ProviderAdapter } from '../../domain/subscriptions';

/**
 * Provider registration information
 */
export interface ProviderRegistration {
  /**
   * Unique provider name (e.g., 'whop', 'applepay')
   */
  name: string;

  /**
   * Provider adapter instance
   */
  adapter: ProviderAdapter;

  /**
   * Whether the provider is enabled
   */
  enabled: boolean;

  /**
   * Provider metadata
   */
  metadata?: {
    displayName?: string;
    description?: string;
    version?: string;
    [key: string]: any;
  };
}

/**
 * Provider metadata options for decorator
 */
export interface ProviderMetadataOptions {
  name: string;
  displayName?: string;
  description?: string;
  enabled?: boolean;
}
