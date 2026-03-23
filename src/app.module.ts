import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FilesModule } from './files/files.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    AuthModule,
    FilesModule,
    UsersModule,
    UploadsModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads_folder'),
      serveRoot: '/uploads_folder',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
