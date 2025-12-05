import axios from 'axios';
import { Transform } from 'node:stream';

interface AggregatedError {
  type: string;
  level: number;
  count: number;
  firstSeen: number;
  lastSeen: number;
  endpoints: Set<string>;
  statusCodes: Set<number>;
  messages: Set<string>;
  attempts: number[];
  sampleLog: any;
}

export class SlackTransport extends Transform {
  private readonly webhookUrl: string;
  private readonly minLevel: string;

  private readonly aggregationMap: Map<string, AggregatedError> = new Map();
  private readonly AGGREGATION_WINDOW_MS = 30000;
  private flushTimer: NodeJS.Timeout | null = null;

  private messagesInMinute = 0;
  private minuteStart = Date.now();
  private readonly MAX_MESSAGES_PER_MINUTE = 15;

  constructor(webhookUrl: string, minLevel: 'error' | 'warn' = 'error') {
    super({ objectMode: true });
    this.webhookUrl = webhookUrl;
    this.minLevel = minLevel;

    this.startFlushTimer();
  }

  _transform(chunk: any, encoding: string, callback: Function) {
    try {
      const log = typeof chunk === 'string' ? JSON.parse(chunk) : chunk;
      const logLevel =
        typeof log.level === 'string'
          ? this.getLevelValue(log.level)
          : log.level;

      const minLevelValue = this.getLevelValue(this.minLevel);
      const shouldSend = logLevel >= minLevelValue;

      if (shouldSend && this.webhookUrl) {
        const errorType = this.getErrorType(log);

        if (this.isCritical(log, logLevel)) {
          this.sendToSlack(log).catch(() => {});
        } else {
          this.aggregateError(errorType, log, logLevel);
        }
      }

      callback();
    } catch (error: any) {
      callback();
    }
  }

  private getErrorType(log: any): string {
    if (log.statusCode === 429 && log.attempt !== undefined) {
      return `rate_limit_attempt_${log.attempt}`;
    }

    if (log.circuitBreaker && log.msg?.includes('failure')) {
      return 'circuit_breaker_failure';
    }

    if (log.msg?.includes('Failed to fetch')) {
      return 'fetch_failure_breaker_open';
    }

    return `error_${log.statusCode || 'unknown'}`;
  }

  private isCritical(log: any, logLevel: number): boolean {
    if (logLevel >= 60) return true;

    if (log.retriesExhausted === true) return true;

    if (log.state === 'open') return true;

    return false;
  }

  private aggregateError(errorType: string, log: any, logLevel: number) {
    const now = Date.now();

    if (!this.aggregationMap.has(errorType)) {
      this.aggregationMap.set(errorType, {
        type: errorType,
        level: logLevel,
        count: 0,
        firstSeen: now,
        lastSeen: now,
        endpoints: new Set(),
        statusCodes: new Set(),
        messages: new Set(),
        attempts: [],
        sampleLog: log,
      });
    }

    const agg = this.aggregationMap.get(errorType);
    if (!agg) return;

    agg.count++;
    agg.lastSeen = now;

    if (log.endpoint) agg.endpoints.add(log.endpoint);
    if (log.statusCode) agg.statusCodes.add(log.statusCode);
    if (log.msg) agg.messages.add(log.msg);
    if (log.attempt !== undefined) agg.attempts.push(log.attempt);
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flushAggregatedErrors();
    }, this.AGGREGATION_WINDOW_MS);
  }

  private async flushAggregatedErrors() {
    const now = Date.now();

    if (now - this.minuteStart > 60000) {
      this.messagesInMinute = 0;
      this.minuteStart = now;
    }

    for (const [errorType, agg] of this.aggregationMap.entries()) {
      const timeSinceLastLog = now - agg.lastSeen;

      if (timeSinceLastLog >= this.AGGREGATION_WINDOW_MS) {
        if (this.messagesInMinute < this.MAX_MESSAGES_PER_MINUTE) {
          this.messagesInMinute++;
          await this.sendAggregatedToSlack(agg);
        }

        this.aggregationMap.delete(errorType);
      }
    }
  }

  private async sendAggregatedToSlack(agg: AggregatedError) {
    const color = this.getColor(agg.level);

    let title = '⚠️ RATE LIMIT WARNINGS';
    if (agg.type.includes('circuit_breaker')) {
      title = '🔴 CIRCUIT BREAKER FAILURES';
    } else if (agg.type.includes('fetch_failure')) {
      title = '⚠️ FETCH FAILURES (Breaker Open)';
    }

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: title,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Total Occurrences:*\n${agg.count}`,
          },
          {
            type: 'mrkdwn',
            text: `*Time Window:*\n${new Date(agg.firstSeen).toLocaleTimeString('pt-BR')} - ${new Date(agg.lastSeen).toLocaleTimeString('pt-BR')}`,
          },
        ],
      },
    ];

    if (agg.statusCodes.size > 0) {
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Status Codes:*\n${Array.from(agg.statusCodes).join(', ')}`,
          },
          {
            type: 'mrkdwn',
            text: `*Affected Endpoints:*\n${agg.endpoints.size}`,
          },
        ],
      });
    }

    if (agg.endpoints.size > 0) {
      const endpointsList = Array.from(agg.endpoints).slice(0, 5);
      const remaining = agg.endpoints.size - 5;

      let endpointsText = endpointsList.map((ep) => `• \`${ep}\``).join('\n');
      if (remaining > 0) {
        endpointsText += `\n... and ${remaining} more`;
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Sample Endpoints:*\n${endpointsText}`,
        },
      });
    }

    if (agg.attempts.length > 0) {
      const avgAttempt = (
        agg.attempts.reduce((a, b) => a + b, 0) / agg.attempts.length
      ).toFixed(1);
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Retry Stats:*\nAverage attempt: ${avgAttempt}\nAll are being retried automatically ✅`,
        },
      });
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Sample message: _"${agg.sampleLog.msg}"_`,
        },
      ],
    });

    try {
      await axios.post(this.webhookUrl, {
        attachments: [
          {
            color,
            blocks,
          },
        ],
      });
    } catch (error: any) {
      // Silently fail to avoid breaking the application
    }
  }

  private async sendToSlack(log: any) {
    const now = Date.now();
    if (now - this.minuteStart > 60000) {
      this.messagesInMinute = 0;
      this.minuteStart = now;
    }

    if (this.messagesInMinute >= this.MAX_MESSAGES_PER_MINUTE) {
      return;
    }

    this.messagesInMinute++;

    const color = this.getColor(log.level);
    const emoji = this.getEmoji(log.level);

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} CRITICAL: ${log.level?.toUpperCase() || 'ERROR'}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Message:*\n${log.msg || log.message || 'No message'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Time:*\n${new Date(log.time).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
          },
        ],
      },
    ];

    const contextFields = [];

    if (log.endpoint) {
      contextFields.push({
        type: 'mrkdwn',
        text: `*Endpoint:*\n\`${log.endpoint}\``,
      });
    }

    if (log.statusCode) {
      contextFields.push({
        type: 'mrkdwn',
        text: `*Status:*\n${log.statusCode}`,
      });
    }

    if (log.circuitBreaker) {
      contextFields.push({
        type: 'mrkdwn',
        text: `*Circuit Breaker:*\n${log.circuitBreaker}`,
      });
    }

    if (log.state) {
      contextFields.push({
        type: 'mrkdwn',
        text: `*State:*\n${log.state}`,
      });
    }

    if (contextFields.length > 0) {
      blocks.push({
        type: 'section',
        fields: contextFields,
      });
    }

    if (log.attempt !== undefined || log.waitTime !== undefined) {
      const retryFields = [];

      if (log.attempt !== undefined) {
        retryFields.push({
          type: 'mrkdwn',
          text: `*Attempt:*\n${log.attempt + 1}/${log.maxRetries || 'N/A'}`,
        });
      }

      if (log.waitTime !== undefined) {
        retryFields.push({
          type: 'mrkdwn',
          text: `*Wait Time:*\n${log.waitTime}ms`,
        });
      }

      if (retryFields.length > 0) {
        blocks.push({
          type: 'section',
          fields: retryFields,
        });
      }
    }

    if (log.err?.stack || log.stack) {
      const stackTrace = (log.err?.stack || log.stack).substring(0, 500);
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Stack Trace:*\n\`\`\`${stackTrace}${stackTrace.length >= 500 ? '...' : ''}\`\`\``,
        },
      });
    }

    try {
      await axios.post(this.webhookUrl, {
        attachments: [
          {
            color,
            blocks,
          },
        ],
      });
    } catch (error: any) {
      // Silently fail to avoid breaking the application
    }
  }

  private getLevelValue(level: string): number {
    const levels: Record<string, number> = {
      trace: 10,
      debug: 20,
      info: 30,
      warn: 40,
      error: 50,
      fatal: 60,
    };
    return levels[level] || 30;
  }

  private getColor(level: number): string {
    if (level >= 50) return '#dc3545';
    if (level >= 40) return '#ffc107';
    return '#17a2b8';
  }

  private getEmoji(level: number): string {
    if (level >= 60) return '💀';
    if (level >= 50) return '🔴';
    if (level >= 40) return '⚠️';
    return 'ℹ️';
  }

  _final(callback: Function) {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushAggregatedErrors().finally(() => callback());
  }
}
