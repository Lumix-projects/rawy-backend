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

describe('Library Controller (Contract)', () => {
  let app: INestApplication<App>;
  let listenerToken: string;
  let creatorToken: string;
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
            url: 'https://example.com/covers/lib.jpg',
            key: 'covers/lib.jpg',
          }),
        deleteByKey: () => Promise.resolve(),
      })
      .overrideProvider(AudioUploadService)
      .useValue({
        uploadAudio: () =>
          Promise.resolve({
            url: 'https://example.com/audio/lib-ep.mp3',
            key: 'episodes/lib-ep.mp3',
          }),
        deleteByKey: () => Promise.resolve(),
        getPresignedStreamUrl: () =>
          Promise.resolve('https://presigned.example.com/stream/test'),
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
      username: `lib_creator_${Date.now()}`,
      email: `lib_creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });

    const listenerUserId = new Types.ObjectId();
    await users.insertOne({
      _id: listenerUserId,
      username: `lib_listener_${Date.now()}`,
      email: `lib_listener_${Date.now()}@test.com`,
      passwordHash,
      role: 'listener',
      emailVerified: true,
    });

    const secret = configService.get('JWT_SECRET', 'change-me-in-production');
    creatorToken = jwtService.sign(
      { sub: creatorUserId.toString(), email: 'creator@test.com' },
      { secret, expiresIn: '15m' },
    );
    listenerToken = jwtService.sign(
      { sub: listenerUserId.toString(), email: 'listener@test.com' },
      { secret, expiresIn: '15m' },
    );

    const createPodcastRes = await request(app.getHttpServer())
      .post('/api/v1/podcasts')
      .set('Authorization', `Bearer ${creatorToken}`)
      .field('title', 'Library Test Podcast')
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
      .field('title', 'Library Episode')
      .field('duration', '300')
      .attach('audio', Buffer.from('fake'), {
        filename: 'ep.mp3',
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

  describe('GET /library/history', () => {
    it('returns 200 with items and total', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/library/history')
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/library/history')
        .expect(401);
    });
  });

  describe('GET /library/bookmarks', () => {
    it('returns 200 with items and total', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/library/bookmarks')
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/library/bookmarks')
        .expect(401);
    });
  });

  describe('POST /library/bookmarks', () => {
    it('returns 201 when adding bookmark', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/library/bookmarks')
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ episodeId })
        .expect(201);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/library/bookmarks')
        .send({ episodeId })
        .expect(401);
    });

    it('returns 404 for non-existent episode', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/library/bookmarks')
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ episodeId: '000000000000000000000000' })
        .expect(404);
    });
  });

  describe('DELETE /library/bookmarks', () => {
    it('returns 204 when removing bookmark', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/library/bookmarks?episodeId=${episodeId}`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(204);
    });

    it('returns 400 when episodeId missing', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/library/bookmarks')
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(400);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/library/bookmarks?episodeId=${episodeId}`)
        .expect(401);
    });
  });
});
