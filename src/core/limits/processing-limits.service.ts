import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProcessingLimits {
  maxRecords: number;
  maxProcessingTimeMs: number;
  maxPages: number;
}

@Injectable()
export class ProcessingLimitsService {
  constructor(private readonly configService: ConfigService) {}

  getBackfillLimits(): ProcessingLimits {
    return {
      maxRecords:
        this.configService.get<number>('MAX_RECORDS_PER_RUN', 10000),
      maxProcessingTimeMs:
        this.configService.get<number>('MAX_PROCESSING_TIME_MS', 1800000), // 30min
      maxPages: this.configService.get<number>('MAX_PAGES', 1000),
    };
  }

  getAnalysisTimeout(): number {
    return this.configService.get<number>(
      'ANALYSIS_PROCESSING_TIMEOUT',
      300000, // 5min
    );
  }

  getBackfillBatchTimeout(): number {
    return this.configService.get<number>(
      'BACKFILL_BATCH_TIMEOUT',
      300000,
    );
  }

  getApiCallTimeout(): number {
    return this.configService.get<number>('API_CALL_TIMEOUT', 10000);
  }

  getDbQueryTimeout(): number {
    return this.configService.get<number>('DB_QUERY_TIMEOUT', 5000);
  }
}
