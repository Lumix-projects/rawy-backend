import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { CoverUploadService } from '../../src/shared/upload/upload.service';
import { AudioUploadService } from '../../src/shared/upload/audio-upload.service';
import { UploadRateLimitService } from '../../src/shared/rate-limit/upload-rate-limit.service';

describe('Subscriptions Controller (Contract)', () => {
  let app: INestApplication<App>;
  let listenerToken: string;
  let listenerId: string;
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
          Promise.resolve({
            url: 'https://example.com/covers/sub.jpg',
            key: 'covers/sub.jpg',
          }),
        deleteByKey: () => Promise.resolve(),
      })
      .overrideProvider(AudioUploadService)
      .useValue({
        uploadAudio: () =>
          Promise.resolve({
            url: 'https://example.com/audio/sub-ep.mp3',
            key: 'episodes/sub-ep.mp3',
          }),
        deleteByKey: () => Promise.resolve(),
      })
      .overrideProvider(UploadRateLimitService)
      .useValue({
        checkAndIncrement: () => Promise.resolve(),
        getCount: () => Promise.resolve(0),
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

    let cat = await categories.findOne({ slug: 'tech' });
    if (!cat) {
      await categories.insertOne({ slug: 'tech', name: 'Technology' });
      cat = await categories.findOne({ slug: 'tech' });
    }
    categoryId = cat!._id.toString();

    const passwordHash = await bcrypt.hash('TestPassword123!', 12);

    const creatorUserId = new Types.ObjectId();
    await users.insertOne({
      _id: creatorUserId,
      username: `sub_creator_${Date.now()}`,
      email: `sub_creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });
    creatorId = creatorUserId.toString();

    const listenerUserId = new Types.ObjectId();
    await users.insertOne({
      _id: listenerUserId,
      username: `sub_listener_${Date.now()}`,
      email: `sub_listener_${Date.now()}@test.com`,
      passwordHash,
      role: 'listener',
      emailVerified: true,
    });
    listenerId = listenerUserId.toString();

    const secret = configService.get('JWT_SECRET', 'change-me-in-production');
    creatorToken = jwtService.sign(
      { sub: creatorId, email: 'creator@test.com' },
      { secret, expiresIn: '15m' },
    );
    listenerToken = jwtService.sign(
      { sub: listenerId, email: 'listener@test.com' },
      { secret, expiresIn: '15m' },
    );

    const createPodcastRes = await request(app.getHttpServer())
      .post('/api/v1/podcasts')
      .set('Authorization', `Bearer ${creatorToken}`)
      .field('title', 'Subscription Test Podcast')
      .field('categoryId', categoryId)
      .field('language', 'en')
      .attach('cover', Buffer.from('fake'), {
        filename: 'cover.jpg',
        contentType: 'image/jpeg',
      });
    podcastId = createPodcastRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/podcasts/${podcastId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ status: 'published' });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /subscriptions', () => {
    it('returns 201 when subscribing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ podcastId })
        .expect(201);
      expect(res.body).toHaveProperty('message');
    });

    it('returns 400 when already subscribed', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ podcastId })
        .expect(400);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/subscriptions')
        .send({ podcastId })
        .expect(401);
    });

    it('returns 404 for non-existent podcast', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/subscriptions')
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ podcastId: '000000000000000000000000' })
        .expect(404);
    });
  });

  describe('GET /subscriptions', () => {
    it('returns 200 with items and total', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/subscriptions')
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/subscriptions')
        .expect(401);
    });
  });

  describe('DELETE /subscriptions', () => {
    it('returns 204 when unsubscribing', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/subscriptions?podcastId=${podcastId}`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(204);
    });

    it('returns 400 when podcastId missing', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/subscriptions')
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(400);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/subscriptions?podcastId=${podcastId}`)
        .expect(401);
    });
  });
});
