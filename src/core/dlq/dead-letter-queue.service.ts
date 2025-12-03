import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { logger } from '../logger/logger.config';

export interface FailedEvent {
  id: string;
  eventType: string;
  payload: any;
  error: string;
  timestamp: Date;
  retryCount: number;
}

@Injectable()
export class DeadLetterQueueService implements OnModuleInit {
  private readonly logger = logger();
  private readonly dlq: FailedEvent[] = [];
  private readonly maxSize: number;
  private readonly retentionDays: number;
  private readonly alertThreshold: number;

  constructor(private readonly configService: ConfigService) {
    this.maxSize = this.configService.get<number>('MAX_DLQ_SIZE', 10000);
    this.retentionDays = this.configService.get<number>(
      'DLQ_RETENTION_DAYS',
      7,
    );
    this.alertThreshold = this.configService.get<number>(
      'DLQ_ALERT_THRESHOLD',
      8000,
    );
  }

  onModuleInit() {
    this.logger.info('DeadLetterQueueService initialized successfully');
  }

  @Interval(60 * 60 * 1000)
  handleCleanup() {
    try {
      this.cleanupOldEvents();
    } catch (error: any) {
      this.logger.error(
        { error: error.message, stack: error.stack },
        'Error during DLQ cleanup',
      );
    }
  }

  addFailedEvent(
    eventId: string,
    eventType: string,
    payload: any,
    error: Error | string,
    retryCount: number = 0,
  ): void {
    try {
      const existing = this.dlq.find((e) => e.id === eventId);
      if (existing) {
        existing.retryCount = retryCount;
        existing.error = error instanceof Error ? error.message : error;
        existing.timestamp = new Date();
        this.logger.warn(
          { eventId, retryCount },
          'Updated existing failed event in DLQ',
        );
        return;
      }

      if (this.dlq.length >= this.maxSize) {
        this.logger.error(
          { dlqSize: this.dlq.length, maxSize: this.maxSize },
          'DLQ is full, archiving old events',
        );
        this.archiveOldEvents();
      }

      const failedEvent: FailedEvent = {
        id: eventId,
        eventType,
        payload,
        error: error instanceof Error ? error.message : error,
        timestamp: new Date(),
        retryCount,
      };

      this.dlq.push(failedEvent);
      this.logger.warn(
        { eventId, eventType, dlqSize: this.dlq.length },
        'Event added to DLQ',
      );

      if (this.dlq.length >= this.alertThreshold) {
        this.alert('DLQ approaching limit');
      }
    } catch (error: any) {
      this.logger.error(
        { error: error.message, eventId, eventType },
        'Error adding event to DLQ',
      );
    }
  }

  private cleanupOldEvents(): void {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      const initialSize = this.dlq.length;
      const filtered = this.dlq.filter((event) => event.timestamp > cutoffDate);
      const removed = initialSize - filtered.length;

      this.dlq.length = 0;
      this.dlq.push(...filtered);

      if (removed > 0) {
        this.logger.info(
          { removed, remaining: this.dlq.length },
          'Cleaned up old DLQ events',
        );
      }
    } catch (error: any) {
      this.logger.error(
        { error: error.message, stack: error.stack },
        'Error during cleanup of old events',
      );
    }
  }

  private archiveOldEvents(): void {
    try {
      const toRemove = Math.floor(this.dlq.length * 0.2);
      this.dlq.splice(0, toRemove);
      this.logger.warn(
        { archived: toRemove, remaining: this.dlq.length },
        'Archived old DLQ events',
      );
    } catch (error: any) {
      this.logger.error(
        { error: error.message, stack: error.stack },
        'Error archiving old events',
      );
    }
  }

  getSize(): number {
    return this.dlq.length;
  }

  getFailedEvents(limit?: number): FailedEvent[] {
    const events = [...this.dlq].reverse();
    return limit ? events.slice(0, limit) : events;
  }

  removeEvent(eventId: string): boolean {
    try {
      const index = this.dlq.findIndex((e) => e.id === eventId);
      if (index !== -1) {
        this.dlq.splice(index, 1);
        this.logger.info({ eventId }, 'Event removed from DLQ');
        return true;
      }
      return false;
    } catch (error: any) {
      this.logger.error(
        { error: error.message, eventId },
        'Error removing event from DLQ',
      );
      return false;
    }
  }

  private alert(message: string): void {
    this.logger.error(
      {
        message,
        dlqSize: this.dlq.length,
        maxSize: this.maxSize,
        threshold: this.alertThreshold,
      },
      'DLQ Alert',
    );
  }
}
