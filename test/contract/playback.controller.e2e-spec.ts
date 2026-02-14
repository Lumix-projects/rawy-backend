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
import { AudioUploadService } from '../../src/shared/upload/audio-upload.service';
import { UploadRateLimitService } from '../../src/shared/rate-limit/upload-rate-limit.service';

describe('Playback Controller (Contract)', () => {
  let app: INestApplication<App>;
  let listenerToken: string;
  let listenerId: string;
  let creatorToken: string;
  let creatorId: string;
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
          Promise.resolve({ url: 'https://example.com/covers/playback.jpg', key: 'covers/playback.jpg' }),
        deleteByKey: () => Promise.resolve(),
      })
      .overrideProvider(AudioUploadService)
      .useValue({
        uploadAudio: () =>
          Promise.resolve({ url: 'https://example.com/audio/playback-ep.mp3', key: 'episodes/playback-ep.mp3' }),
        deleteByKey: () => Promise.resolve(),
        getPresignedStreamUrl: (key: string) =>
          Promise.resolve(`https://presigned.example.com/stream/${key}?expires=3600`),
        getPresignedDownloadUrl: (key: string) =>
          Promise.resolve(`https://presigned.example.com/download/${key}?expires=3600`),
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
      username: `playback_creator_${Date.now()}`,
      email: `playback_creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });
    creatorId = creatorUserId.toString();

    const listenerUserId = new Types.ObjectId();
    await users.insertOne({
      _id: listenerUserId,
      username: `playback_listener_${Date.now()}`,
      email: `playback_listener_${Date.now()}@test.com`,
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
      .field('title', 'Playback Test Podcast')
      .field('categoryId', categoryId)
      .field('language', 'en')
      .attach('cover', Buffer.from('fake'), { filename: 'cover.jpg', contentType: 'image/jpeg' });
    podcastId = createPodcastRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/podcasts/${podcastId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ status: 'published' });

    const createEpisodeRes = await request(app.getHttpServer())
      .post(`/api/v1/podcasts/${podcastId}/episodes`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .field('title', 'Playback Episode')
      .field('duration', '600')
      .attach('audio', Buffer.from('fake'), { filename: 'ep.mp3', contentType: 'audio/mpeg' });
    episodeId = createEpisodeRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/episodes/${episodeId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ status: 'published' });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /episodes/:episodeId/stream-url', () => {
    it('returns 200 with url and expiresIn when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/episodes/${episodeId}/stream-url`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('url');
      expect(res.body).toHaveProperty('expiresIn');
      expect(typeof res.body.url).toBe('string');
      expect(res.body.url.length).toBeGreaterThan(0);
      expect(typeof res.body.expiresIn).toBe('number');
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/episodes/${episodeId}/stream-url`)
        .expect(401);
    });

    it('returns 404 for non-existent episode', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/episodes/000000000000000000000000/stream-url')
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(404);
    });
  });

  describe('GET /episodes/:episodeId/download-url', () => {
    it('returns 200 with url and expiresIn when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/episodes/${episodeId}/download-url`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('url');
      expect(res.body).toHaveProperty('expiresIn');
      expect(typeof res.body.url).toBe('string');
      expect(res.body.url.length).toBeGreaterThan(0);
      expect(typeof res.body.expiresIn).toBe('number');
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/episodes/${episodeId}/download-url`)
        .expect(401);
    });
  });

  describe('PUT /playback/progress', () => {
    it('returns 200 when updating progress', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/playback/progress')
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ episodeId, positionSeconds: 120 })
        .expect(200);
    });

    it('returns 400 when episodeId or positionSeconds missing', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/playback/progress')
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({})
        .expect(400);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/playback/progress')
        .send({ episodeId, positionSeconds: 60 })
        .expect(401);
    });
  });

  describe('GET /playback/progress', () => {
    it('returns 200 with progress object', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/playback/progress?episodeIds=${episodeId}`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
      expect(typeof res.body).toBe('object');
    });
  });

  describe('POST /episodes/:episodeId/record-play', () => {
    it('returns 204 when recording play event', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/episodes/${episodeId}/record-play`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ listenedSeconds: 60 })
        .expect(204);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/episodes/${episodeId}/record-play`)
        .send({ listenedSeconds: 30 })
        .expect(401);
    });
  });
});
