import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger } from './core/logger/logger.config';

async function bootstrap() {
  const pinoLogger = logger();

  process.setMaxListeners(30);

  try {
    const app = await NestFactory.create(AppModule, {
      logger: false,
    });

    const configService = app.get(ConfigService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    app.setGlobalPrefix('api');

    const port = configService.get<number>('PORT', 3001);
    await app.listen(port);

    pinoLogger.info(`Application running on: http://localhost:${port}`);
  } catch (error: any) {
    pinoLogger.error(
      { error: error.message, stack: error.stack },
      'Bootstrap failed',
    );
    throw error;
  }
}

bootstrap().catch((error) => {
  const pinoLogger = logger();
  pinoLogger.error(
    { error: error.message, stack: error.stack },
    'Failed to start application',
  );
  process.exit(1);
});
