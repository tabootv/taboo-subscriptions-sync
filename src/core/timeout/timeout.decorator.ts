import { SetMetadata } from '@nestjs/common';

export const TIMEOUT_KEY = 'timeout';
export const Timeout = (timeoutMs: number) => SetMetadata(TIMEOUT_KEY, timeoutMs);
