import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { join } from 'path'; // ✅ ADD THIS

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 🛡️ 1. Configuration
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    exposedHeaders: ['Accept-Ranges', 'Content-Length', 'Content-Range'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      stopAtFirstError: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(new LoggingInterceptor());

  // 🔥🔥🔥 ADD THIS BLOCK (CRITICAL)
  app.useStaticAssets(join(__dirname, '..', 'uploads_folder'), {
    prefix: '/uploads_folder',
  });

  // 🛡️ 2. Start server
  const PORT = process.env.PORT || 8080;

  try {
    await app.listen(PORT);
    console.log(`🚀 Server running on port ${PORT}`);
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
