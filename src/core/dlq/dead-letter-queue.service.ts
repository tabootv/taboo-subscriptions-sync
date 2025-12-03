import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    this.logger.info('DeadLetterQueueService initializing...');
    this.maxSize =
      this.configService.get<number>('MAX_DLQ_SIZE', 10000);
    this.retentionDays =
      this.configService.get<number>('DLQ_RETENTION_DAYS', 7);
    this.alertThreshold =
      this.configService.get<number>('DLQ_ALERT_THRESHOLD', 8000);
  }

  onModuleInit() {
    this.logger.info('DeadLetterQueueService onModuleInit called');
    // Periodic cleanup of old events
    setInterval(() => {
      this.cleanupOldEvents();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Adds failed event to DLQ
   */
  addFailedEvent(
    eventId: string,
    eventType: string,
    payload: any,
    error: Error | string,
    retryCount: number = 0,
  ): void {
    // Checks if already exists (idempotency)
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

    // Checks limit
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

    // Alerta se próximo do limite
    if (this.dlq.length >= this.alertThreshold) {
      this.alert('DLQ approaching limit');
    }
  }

  /**
   * Removes old events based on retention
   */
  private cleanupOldEvents(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const initialSize = this.dlq.length;
    const filtered = this.dlq.filter((event) => event.timestamp > cutoffDate);
    const removed = initialSize - filtered.length;

    // Substitui array (mantém referência)
    this.dlq.length = 0;
    this.dlq.push(...filtered);

    if (removed > 0) {
      this.logger.info(
        { removed, remaining: this.dlq.length },
        'Cleaned up old DLQ events',
      );
    }
  }

  /**
   * Archives old events when DLQ is full
   */
  private archiveOldEvents(): void {
    // Remove os 20% mais antigos
    const toRemove = Math.floor(this.dlq.length * 0.2);
    this.dlq.splice(0, toRemove);
    this.logger.warn(
      { archived: toRemove, remaining: this.dlq.length },
      'Archived old DLQ events',
    );
  }

  /**
   * Retorna tamanho atual do DLQ
   */
  getSize(): number {
    return this.dlq.length;
  }

  /**
   * Retorna eventos falhos
   */
  getFailedEvents(limit?: number): FailedEvent[] {
    const events = [...this.dlq].reverse(); // Mais recentes primeiro
    return limit ? events.slice(0, limit) : events;
  }

  /**
   * Removes event from DLQ (when successfully reprocessed)
   */
  removeEvent(eventId: string): boolean {
    const index = this.dlq.findIndex((e) => e.id === eventId);
    if (index !== -1) {
      this.dlq.splice(index, 1);
      this.logger.info({ eventId }, 'Event removed from DLQ');
      return true;
    }
    return false;
  }

  /**
   * Alerts when approaching limit
   */
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
    // Here you can integrate with your alerting system (PagerDuty, Slack, etc)
  }
}
