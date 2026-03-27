import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { CORS_CONFIG, SERVER_CONFIG } from '@/config/app.config';
import { FILES_CONFIG } from '@/config/files.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors(CORS_CONFIG);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      stopAtFirstError: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(new LoggingInterceptor());

  app.useStaticAssets(join(__dirname, '..', FILES_CONFIG.uploadDirectoryName), {
    prefix: FILES_CONFIG.uploadRoutePrefix,
  });

  try {
    await app.listen(SERVER_CONFIG.port);
    console.log(`Server running on port ${SERVER_CONFIG.port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

void bootstrap();
