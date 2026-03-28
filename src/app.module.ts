import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FilesModule } from './files/files.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { UploadsModule } from './uploads/uploads.module';
import { FILES_CONFIG } from '@/config/files.config';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [
    AuthModule,
    FilesModule,
    UsersModule,
    UploadsModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', FILES_CONFIG.uploadDirectoryName),
      serveRoot: FILES_CONFIG.uploadRoutePrefix,
    }),
    DocumentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
