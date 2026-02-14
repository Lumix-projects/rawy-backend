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

describe('Episodes Controller (Contract)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let conn: Connection;
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
          Promise.resolve({ url: 'https://example.com/covers/test.jpg', key: 'covers/test.jpg' }),
        deleteByKey: () => Promise.resolve(),
      })
      .overrideProvider(AudioUploadService)
      .useValue({
        uploadAudio: () =>
          Promise.resolve({ url: 'https://example.com/audio/ep1.mp3', key: 'episodes/ep1.mp3' }),
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

    jwtService = moduleFixture.get(JwtService);
    const configService = moduleFixture.get(ConfigService);
    conn = moduleFixture.get(getConnectionToken());
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
      username: `ep_creator_${Date.now()}`,
      email: `ep_creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });
    creatorId = userId.toString();

    creatorToken = jwtService.sign(
      { sub: creatorId, email: 'creator@test.com' },
      { secret: configService.get('JWT_SECRET', 'change-me-in-production'), expiresIn: '15m' },
    );

    const createPodcastRes = await request(app.getHttpServer())
      .post('/api/v1/podcasts')
      .set('Authorization', `Bearer ${creatorToken}`)
      .field('title', 'Episodes Test Podcast')
      .field('categoryId', categoryId)
      .field('language', 'en')
      .attach('cover', Buffer.from('fake'), { filename: 'cover.jpg', contentType: 'image/jpeg' });

    podcastId = createPodcastRes.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /podcasts/:podcastId/episodes', () => {
    it('returns 201 with episode when audio and required fields provided', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/podcasts/${podcastId}/episodes`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .field('title', 'My First Episode')
        .field('duration', '120')
        .attach('audio', Buffer.from('fake mp3 content'), { filename: 'ep1.mp3', contentType: 'audio/mpeg' })
        .expect(201);

      expect(res.body).toMatchObject({
        title: 'My First Episode',
        status: expect.any(String),
        podcastId,
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.audioUrl || res.body.duration).toBeDefined();
      episodeId = res.body.id;
    });

    it('returns 400 when audio is missing', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/podcasts/${podcastId}/episodes`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .field('title', 'No Audio')
        .expect(400);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/podcasts/${podcastId}/episodes`)
        .field('title', 'No Auth')
        .attach('audio', Buffer.from('fake'), { filename: 'ep.mp3', contentType: 'audio/mpeg' })
        .expect(401);
    });
  });

  describe('GET /podcasts/:podcastId/episodes', () => {
    it('returns 200 with items and total', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/podcasts/${podcastId}/episodes`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe('GET /episodes/:episodeId', () => {
    it('returns 200 with episode when found', async () => {
      if (!episodeId) return;
      const res = await request(app.getHttpServer())
        .get(`/api/v1/episodes/${episodeId}`)
        .expect(200);

      expect(res.body.id).toBe(episodeId);
      expect(res.body.title).toBeDefined();
      expect(res.body.podcastId).toBe(podcastId);
    });

    it('returns 404 for non-existent episode', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/episodes/000000000000000000000000')
        .expect(404);
    });
  });

  describe('PATCH /episodes/:episodeId', () => {
    it('returns 200 when updating', async () => {
      if (!episodeId) return;
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/episodes/${episodeId}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ title: 'Updated Episode Title', status: 'published' })
        .expect(200);

      expect(res.body.title).toBe('Updated Episode Title');
      expect(res.body.status).toBe('published');
    });

    it('returns 401 when no token', async () => {
      if (!episodeId) return;
      await request(app.getHttpServer())
        .patch(`/api/v1/episodes/${episodeId}`)
        .send({ title: 'No Auth Update' })
        .expect(401);
    });
  });

  describe('DELETE /episodes/:episodeId', () => {
    it('returns 204 when deleting', async () => {
      if (!episodeId) return;
      await request(app.getHttpServer())
        .delete(`/api/v1/episodes/${episodeId}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(204);
    });
  });
});
