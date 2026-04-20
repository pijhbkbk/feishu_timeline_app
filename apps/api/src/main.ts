import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Feishu Timeline API')
    .setDescription('轻卡新颜色开发项目管理系统 API')
    .setVersion('0.1.0')
    .addCookieAuth('ft_session', {
      type: 'apiKey',
      in: 'cookie',
    })
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    jsonDocumentUrl: 'api/docs-json',
  });

  await app.listen(port, host);

  Logger.log(`API server listening on http://${host}:${port}/api`, 'Bootstrap');
}

void bootstrap();
