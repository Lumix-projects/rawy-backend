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

describe('Analytics Controller (Contract)', () => {
  let app: INestApplication<App>;
  let creatorToken: string;
  let creatorId: string;
  let listenerToken: string;
  let listenerId: string;
  let categoryId: string;
  let podcastId: string;
  let episodeId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CoverUploadService)
      .useValue({
        uploadCover: () =>
          Promise.resolve({
            url: 'https://example.com/covers/analytics.jpg',
            key: 'covers/analytics.jpg',
          }),
        deleteByKey: () => Promise.resolve(),
      })
      .overrideProvider(AudioUploadService)
      .useValue({
        uploadAudio: () =>
          Promise.resolve({
            url: 'https://example.com/audio/analytics-ep.mp3',
            key: 'episodes/analytics-ep.mp3',
          }),
        getPresignedStreamUrl: () => Promise.resolve('https://presigned.stream/url'),
        getPresignedDownloadUrl: () => Promise.resolve('https://presigned.dl/url'),
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
      username: `analytics_creator_${Date.now()}`,
      email: `analytics_creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });
    creatorId = creatorUserId.toString();

    const listenerUserId = new Types.ObjectId();
    await users.insertOne({
      _id: listenerUserId,
      username: `analytics_listener_${Date.now()}`,
      email: `analytics_listener_${Date.now()}@test.com`,
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
      .field('title', 'Analytics Test Podcast')
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

    const createEpisodeRes = await request(app.getHttpServer())
      .post(`/api/v1/podcasts/${podcastId}/episodes`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .field('title', 'Analytics Episode')
      .attach('audio', Buffer.from('fake'), {
        filename: 'audio.mp3',
        contentType: 'audio/mpeg',
      });
    episodeId = createEpisodeRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/episodes/${episodeId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ status: 'published' });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /podcasts/:podcastId/analytics', () => {
    it('returns 200 with analytics structure for podcast owner', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/podcasts/${podcastId}/analytics`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalPlays');
      expect(res.body).toHaveProperty('uniqueListeners');
      expect(res.body).toHaveProperty('avgListeningDuration');
      expect(res.body).toHaveProperty('subscriberGrowth');
      expect(res.body).toHaveProperty('downloads');
      expect(res.body).toHaveProperty('topEpisodes');
      expect(res.body).toHaveProperty('geography');
      expect(res.body).toHaveProperty('devices');
      expect(typeof res.body.totalPlays).toBe('number');
      expect(typeof res.body.uniqueListeners).toBe('number');
      expect(Array.isArray(res.body.subscriberGrowth)).toBe(true);
      expect(Array.isArray(res.body.topEpisodes)).toBe(true);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/podcasts/${podcastId}/analytics`)
        .expect(401);
    });

    it('returns 403 when non-creator role', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/podcasts/${podcastId}/analytics`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(403);
    });

    it('returns 404 for non-existent podcast', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/podcasts/000000000000000000000000/analytics')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(404);
    });
  });

  describe('GET /episodes/:episodeId/analytics', () => {
    it('returns 200 with analytics structure for episode owner', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/episodes/${episodeId}/analytics`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('plays');
      expect(res.body).toHaveProperty('uniqueListeners');
      expect(res.body).toHaveProperty('avgListeningDuration');
      expect(res.body).toHaveProperty('downloads');
      expect(typeof res.body.plays).toBe('number');
      expect(typeof res.body.uniqueListeners).toBe('number');
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/episodes/${episodeId}/analytics`)
        .expect(401);
    });

    it('returns 403 when non-creator role', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/episodes/${episodeId}/analytics`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(403);
    });

    it('returns 404 for non-existent episode', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/episodes/000000000000000000000000/analytics')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(404);
    });
  });
});
