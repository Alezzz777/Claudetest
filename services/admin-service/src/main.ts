import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: true }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  const config = new DocumentBuilder().setTitle('Admin Service API').setDescription('User management, RBAC, schema registry and audit log (PS-AD)').setVersion('1.0.0').addBearerAuth().build();
  SwaggerModule.setup('api/v1/docs', app, SwaggerModule.createDocument(app, config));
  const fastify = app.getHttpAdapter().getInstance();
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  await app.listen(process.env['PORT'] ?? 3008, '0.0.0.0');
}
bootstrap().catch(console.error);
