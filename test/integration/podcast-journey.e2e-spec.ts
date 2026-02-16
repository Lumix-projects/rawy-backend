import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { CoverUploadService } from '../../src/shared/upload/upload.service';

/**
 * Integration test: Create podcast → publish → verify RSS returns valid RSS 2.0
 * (Browse verification deferred to Phase 5 when discovery module exists)
 */
describe('Podcast Journey (Integration)', () => {
  let app: INestApplication<App>;
  let creatorToken: string;
  let creatorId: string;
  let categoryId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CoverUploadService)
      .useValue({
        uploadCover: () =>
          Promise.resolve({
            url: 'https://example.com/covers/journey.jpg',
            key: 'covers/journey.jpg',
          }),
        deleteByKey: () => Promise.resolve(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const jwtService = moduleFixture.get(JwtService);
    const configService = moduleFixture.get(ConfigService);
    const conn = moduleFixture.get(getConnectionToken());
    const users = conn.db.collection('users');
    const categories = conn.db.collection('categories');

    const cat = await categories.findOne({ slug: 'tech' });
    if (!cat) {
      await categories.insertOne({ slug: 'tech', name: 'Technology' });
    }
    const catDoc = await categories.findOne({ slug: 'tech' });
    categoryId = catDoc!._id.toString();

    const passwordHash = await bcrypt.hash('TestPassword123!', 12);
    const userId = new Types.ObjectId();
    await users.insertOne({
      _id: userId,
      username: `journey_creator_${Date.now()}`,
      email: `journey_creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });
    creatorId = userId.toString();

    const secret = configService.get('JWT_SECRET', 'change-me-in-production');
    creatorToken = jwtService.sign(
      { sub: creatorId, email: 'creator@test.com' },
      { secret, expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('create podcast → publish → GET rss returns valid RSS 2.0', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/podcasts')
      .set('Authorization', `Bearer ${creatorToken}`)
      .field('title', 'Journey Test Podcast')
      .field('categoryId', categoryId)
      .field('language', 'en')
      .field('description', 'Integration test podcast')
      .attach('cover', Buffer.from('fake'), {
        filename: 'cover.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    const podcastId = createRes.body.id;
    expect(podcastId).toBeDefined();
    expect(createRes.body.status).toBe('draft');

    await request(app.getHttpServer())
      .get(`/api/v1/podcasts/${podcastId}`)
      .expect(404);

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/podcasts/${podcastId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ status: 'published' })
      .expect(200);

    expect(patchRes.body.status).toBe('published');

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/podcasts/${podcastId}`)
      .expect(200);

    expect(getRes.body.title).toBe('Journey Test Podcast');
    expect(getRes.body.status).toBe('published');

    const rssRes = await request(app.getHttpServer())
      .get(`/api/v1/podcasts/${podcastId}/rss`)
      .expect(200)
      .expect('Content-Type', /application\/rss\+xml/);

    expect(rssRes.text).toContain('<?xml version="1.0"');
    expect(rssRes.text).toContain('<rss version="2.0"');
    expect(rssRes.text).toContain('<channel>');
    expect(rssRes.text).toContain('<title>Journey Test Podcast</title>');
    expect(rssRes.text).toContain('</rss>');
  });
});
