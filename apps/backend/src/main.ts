import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { getFrontendUrl } from './common/utils/cookie';
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  // Security headers
  app.use(helmet());

  // Cookie parser
  app.use(cookieParser());

  // Global validation
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

  // CORS
  app.enableCors({
    origin: getFrontendUrl(),
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  Logger.log(`Backend running on port ${port}`, 'Bootstrap');
}
bootstrap();
