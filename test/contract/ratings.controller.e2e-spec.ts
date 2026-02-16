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

describe('Ratings Controller (Contract)', () => {
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
            url: 'https://example.com/covers/rating.jpg',
            key: 'covers/rating.jpg',
          }),
        deleteByKey: () => Promise.resolve(),
      })
      .overrideProvider(AudioUploadService)
      .useValue({
        uploadAudio: () =>
          Promise.resolve({
            url: 'https://example.com/audio/rating-ep.mp3',
            key: 'episodes/rating-ep.mp3',
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
      username: `rating_creator_${Date.now()}`,
      email: `rating_creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });
    creatorId = creatorUserId.toString();

    const listenerUserId = new Types.ObjectId();
    await users.insertOne({
      _id: listenerUserId,
      username: `rating_listener_${Date.now()}`,
      email: `rating_listener_${Date.now()}@test.com`,
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
      .field('title', 'Rating Test Podcast')
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

  describe('POST /podcasts/:podcastId/ratings', () => {
    it('returns 201 when rating a podcast', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/podcasts/${podcastId}/ratings`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ stars: 5, reviewText: 'Great podcast!' })
        .expect(201);
      expect(res.body).toBeDefined();
    });

    it('returns 400 when stars out of range', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/podcasts/${podcastId}/ratings`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ stars: 6 })
        .expect(400);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/podcasts/${podcastId}/ratings`)
        .send({ stars: 4 })
        .expect(401);
    });

    it('returns 404 for non-existent podcast', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/podcasts/000000000000000000000000/ratings')
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ stars: 4 })
        .expect(404);
    });
  });

  describe('GET /podcasts/:podcastId/ratings', () => {
    it('returns 200 with averageStars, totalCount, ratings', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/podcasts/${podcastId}/ratings`)
        .expect(200);

      expect(res.body).toHaveProperty('averageStars');
      expect(res.body).toHaveProperty('totalCount');
      expect(res.body).toHaveProperty('ratings');
      expect(Array.isArray(res.body.ratings)).toBe(true);
    });

    it('returns 404 for non-existent podcast', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/podcasts/000000000000000000000000/ratings')
        .expect(404);
    });
  });
});
