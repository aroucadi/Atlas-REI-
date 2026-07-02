import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enforce JWT_SECRET and DATABASE_URL configurations - fail to boot if missing
  if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is missing.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('FATAL: DATABASE_URL environment variable is missing.');
  }

  // Enforce locked down CORS web origins
  const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:3000';
  app.enableCors({
    origin: webOrigin,
    credentials: true,
  });

  // Prefix all routes with /api/v1 except for the root health check
  app.setGlobalPrefix('api/v1', { exclude: ['/'] });

  const port = process.env.PORT ?? 3001;
  console.log(`Atlas REI Backend listening on http://localhost:${port}/api/v1`);
  await app.listen(port);
}
void bootstrap();
