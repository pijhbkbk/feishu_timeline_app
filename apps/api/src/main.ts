import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3001;
  const nodeEnv = configService.get<string>('nodeEnv') ?? process.env.NODE_ENV ?? 'development';
  const host = process.env.HOST?.trim() || (nodeEnv === 'production' ? '127.0.0.1' : '0.0.0.0');
  const frontendUrl =
    process.env.FRONTEND_URL?.trim() || (nodeEnv === 'production' ? '' : 'http://localhost:3000');

  app.setGlobalPrefix('api');
  app.use(cookieParser());

  if (frontendUrl) {
    app.enableCors({
      origin: frontendUrl,
      credentials: true,
    });
  } else {
    Logger.warn(
      'FRONTEND_URL is not configured. Production API expects same-origin requests.',
      'Bootstrap',
    );
  }

  await app.listen(port, host);

  Logger.log(`API server listening on http://${host}:${port}/api`, 'Bootstrap');
}

void bootstrap();
