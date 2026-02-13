import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger API docs from OpenAPI contract
  const specPath = path.join(
    process.cwd(),
    '..',
    'specs',
    '001-user-auth',
    'contracts',
    'auth-api.openapi.yaml',
  );
  if (fs.existsSync(specPath)) {
    const spec = yaml.load(
      fs.readFileSync(specPath, 'utf8'),
    ) as OpenAPIObject;
    SwaggerModule.setup('api-docs', app, spec, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
