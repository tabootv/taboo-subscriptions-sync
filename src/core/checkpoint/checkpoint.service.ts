import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { logger } from '../logger/logger.config';

export interface Checkpoint {
  jobType: string;
  lastProcessedId: string;
  processedCount: number;
  timestamp: Date;
}

@Injectable()
export class CheckpointService {
  private readonly logger = logger();
  private readonly checkpoints: Map<string, Checkpoint> = new Map();

  constructor(private readonly configService: ConfigService) {}

  saveCheckpoint(
    jobType: string,
    lastProcessedId: string,
    processedCount: number,
  ): void {
    const checkpoint: Checkpoint = {
      jobType,
      lastProcessedId,
      processedCount,
      timestamp: new Date(),
    };

    this.checkpoints.set(jobType, checkpoint);
    this.logger.info(
      { jobType, lastProcessedId, processedCount },
      'Checkpoint saved',
    );
  }

  getLastCheckpoint(jobType: string): Checkpoint | null {
    return this.checkpoints.get(jobType) || null;
  }

  clearCheckpoint(jobType: string): void {
    this.checkpoints.delete(jobType);
    this.logger.info({ jobType }, 'Checkpoint cleared');
  }

  getAllCheckpoints(): Record<string, Checkpoint> {
    const result: Record<string, Checkpoint> = {};
    this.checkpoints.forEach((checkpoint, jobType) => {
      result[jobType] = checkpoint;
    });
    return result;
  }
}
