import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { createSameOriginMutationGuard } from './common/same-origin.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3001;
  const nodeEnv = configService.get<string>('nodeEnv') ?? process.env.NODE_ENV ?? 'development';
  const host = process.env.HOST?.trim() || (nodeEnv === 'production' ? '127.0.0.1' : '0.0.0.0');
  const frontendUrl = configService.get<string>('frontendUrl') ?? 'http://localhost:3000';

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(createSameOriginMutationGuard(frontendUrl));
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

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

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

  Logger.log('eventType=api_bootstrap result=listening', 'Bootstrap');
}

void bootstrap();
