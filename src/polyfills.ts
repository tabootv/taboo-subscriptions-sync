import { webcrypto } from 'node:crypto';

if (globalThis.crypto === undefined) {
  (globalThis as any).crypto = webcrypto;
}
