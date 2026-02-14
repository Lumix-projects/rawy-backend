import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Connection } from 'mongoose';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Fix stale unique index on googleId.
  // Drop ANY existing googleId index and recreate with partialFilterExpression
  // so that multiple documents with googleId=null are allowed.
  try {
    const conn = app.get<Connection>(getConnectionToken());
    if (conn.db) {
      const coll = conn.db.collection('users');
      try {
        await coll.dropIndex('googleId_1');
      } catch {
        /* index may not exist – OK */
      }
      await coll.createIndex(
        { googleId: 1 },
        {
          unique: true,
          partialFilterExpression: { googleId: { $type: 'string' } },
          name: 'googleId_1',
        },
      );
    }
  } catch {
    /* ignore – best-effort at startup */
  }
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('Rawi API')
    .setDescription(
      'Authentication and user management for Rawi podcasting platform. ' +
        'Use the auth endpoints to register, login, and manage your account. ' +
        'Protected routes require a Bearer token from the login or refresh endpoints.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearerAuth',
    )
    .addTag('Auth', 'Registration, login, OAuth, and password flows')
    .addTag('Users', 'User profile and upgrade endpoints')
    .addTag('Categories', 'Content categories')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
    },
    customSiteTitle: 'Rawi API Docs',
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  const baseUrl = `http://localhost:${port}`;
  console.log(`Application is running on: ${baseUrl}`);
  console.log(`Swagger API docs: ${baseUrl}/api-docs`);
}
bootstrap();
