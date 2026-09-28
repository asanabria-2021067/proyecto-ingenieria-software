import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { getFrontendUrl } from './common/utils/cookie';
import { applyTrustProxy } from './config/trust-proxy';
import { API_HELMET_OPTIONS } from './config/security-headers';
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  app.setGlobalPrefix('api');

  // G04 (OWASP25-C021 + D2): 0 por defecto = no se confía en X-Forwarded-For.
  applyTrustProxy(app, configService.get<number>('app.trustProxyHops', 0));

  // Security headers. G06 (NBD-1 + C008): HSTS explícito (1 año,
  // includeSubDomains, sin preload); el resto de Helmet con sus defaults.
  app.use(helmet(API_HELMET_OPTIONS));

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

  const port = configService.get<number>('app.port', 3001);
  await app.listen(port);
  Logger.log(`Backend running on port ${port}`, 'Bootstrap');
}
bootstrap();
