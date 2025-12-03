/**
 * Polyfills for Node.js compatibility
 *
 * This file ensures compatibility with older Node.js versions that don't have
 * the global crypto object available. The @nestjs/schedule package requires
 * crypto to be available globally for generating unique job IDs.
 *
 * Note: This is a workaround for servers running Node.js < 15.0.0
 * Ideally, the server should be upgraded to Node.js 18+ (LTS)
 */

// Make crypto available globally
import { webcrypto } from 'node:crypto';

if (globalThis.crypto === undefined) {
  (globalThis as any).crypto = webcrypto;
}
