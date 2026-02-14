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

describe('Podcasts Controller (Contract)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let conn: Connection;
  let creatorToken: string;
  let creatorId: string;
  let categoryId: string;
  let podcastId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CoverUploadService)
      .useValue({
        uploadCover: () =>
          Promise.resolve({ url: 'https://example.com/covers/test.jpg', key: 'covers/test.jpg' }),
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

    jwtService = moduleFixture.get(JwtService);
    const configService = moduleFixture.get(ConfigService);
    conn = moduleFixture.get(getConnectionToken());

    const secret = configService.get('JWT_SECRET', 'change-me-in-production');
    const users = conn.db.collection('users');
    const categories = conn.db.collection('categories');

    let cat = await categories.findOne({ slug: 'tech' });
    if (!cat) {
      const ins = await categories.insertOne({ slug: 'tech', name: 'Technology' });
      cat = await categories.findOne({ _id: ins.insertedId });
    }
    categoryId = cat!._id.toString();

    const passwordHash = await bcrypt.hash('TestPassword123!', 12);
    const userId = new Types.ObjectId();
    await users.insertOne({
      _id: userId,
      username: `creator_${Date.now()}`,
      email: `creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });
    creatorId = userId.toString();

    creatorToken = jwtService.sign(
      { sub: creatorId, email: 'creator@test.com' },
      { secret, expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /podcasts', () => {
    it('returns 201 with podcast when cover and required fields provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/podcasts')
        .set('Authorization', `Bearer ${creatorToken}`)
        .field('title', 'My Test Podcast')
        .field('categoryId', categoryId)
        .field('language', 'en')
        .attach('cover', Buffer.from('fake'), { filename: 'cover.jpg', contentType: 'image/jpeg' })
        .expect(201);

      expect(res.body).toMatchObject({
        title: 'My Test Podcast',
        language: 'en',
        status: expect.any(String),
        ownerId: creatorId,
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.coverUrl).toBeDefined();
      expect(res.body.rssUrl).toContain('/rss');

      podcastId = res.body.id;
    });

    it('returns 400 when cover is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/podcasts')
        .set('Authorization', `Bearer ${creatorToken}`)
        .field('title', 'No Cover')
        .field('categoryId', categoryId)
        .field('language', 'en')
        .expect(400);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/podcasts')
        .field('title', 'No Auth')
        .field('categoryId', categoryId)
        .field('language', 'en')
        .expect(401);
    });
  });

  describe('GET /podcasts (list my podcasts)', () => {
    it('returns 200 with items and total', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/podcasts')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe('GET /podcasts/:podcastId', () => {
    it('returns 404 for draft podcast (public)', async () => {
      if (!podcastId) return;
      await request(app.getHttpServer())
        .get(`/api/v1/podcasts/${podcastId}`)
        .expect(404);
    });
  });

  describe('PATCH /podcasts/:podcastId', () => {
    it('returns 200 when updating and publishing', async () => {
      if (!podcastId) return;
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/podcasts/${podcastId}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ status: 'published' })
        .expect(200);

      expect(res.body.status).toBe('published');
    });
  });

  describe('DELETE /podcasts/:podcastId', () => {
    it('returns 204 when deleting', async () => {
      if (!podcastId) return;
      await request(app.getHttpServer())
        .delete(`/api/v1/podcasts/${podcastId}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(204);
    });
  });
});
