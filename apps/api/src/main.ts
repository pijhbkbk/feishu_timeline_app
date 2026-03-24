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
  const frontendUrl = configService.get<string>('frontendUrl') ?? 'http://localhost:3000';

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  await app.listen(port);

  Logger.log(`API server listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
