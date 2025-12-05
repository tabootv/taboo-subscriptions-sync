import pino from 'pino';
import { SlackTransport } from './slack-transport';

export const logger = () => {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;

  const streams: pino.StreamEntry[] = [
    {
      level: logLevel as pino.Level,
      stream: process.stdout,
    },
  ];

  if (slackWebhook) {
    const slackTransport = new SlackTransport(slackWebhook, 'warn');

    streams.push({
      level: 'warn',
      stream: slackTransport,
    });
  }

  const pinoLogger = pino(
    {
      level: logLevel,
      formatters: {
        level: (label) => {
          return { level: label };
        },
      },
    },
    pino.multistream(streams),
  );

  return pinoLogger;
};
