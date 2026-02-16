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

describe('Discovery Controller (Contract)', () => {
  let app: INestApplication<App>;
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
          Promise.resolve({
            url: 'https://example.com/covers/discovery.jpg',
            key: 'covers/discovery.jpg',
          }),
        deleteByKey: () => Promise.resolve(),
      })
      .overrideProvider(AudioUploadService)
      .useValue({
        uploadAudio: () =>
          Promise.resolve({
            url: 'https://example.com/audio/discovery-ep.mp3',
            key: 'episodes/discovery-ep.mp3',
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
    const podcasts = conn.db.collection('podcasts');
    const episodes = conn.db.collection('episodes');

    let cat = await categories.findOne({ slug: 'tech' });
    if (!cat) {
      await categories.insertOne({ slug: 'tech', name: 'Technology' });
      cat = await categories.findOne({ slug: 'tech' });
    }
    categoryId = cat!._id.toString();

    const passwordHash = await bcrypt.hash('TestPassword123!', 12);
    const userId = new Types.ObjectId();
    await users.insertOne({
      _id: userId,
      username: `discovery_creator_${Date.now()}`,
      email: `discovery_creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });
    creatorId = userId.toString();

    creatorToken = jwtService.sign(
      { sub: creatorId, email: 'creator@test.com' },
      {
        secret: configService.get('JWT_SECRET', 'change-me-in-production'),
        expiresIn: '15m',
      },
    );

    const createPodcastRes = await request(app.getHttpServer())
      .post('/api/v1/podcasts')
      .set('Authorization', `Bearer ${creatorToken}`)
      .field('title', 'Discovery Test Podcast')
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
      .field('title', 'Discovery Episode One')
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

  describe('GET /discovery/browse', () => {
    it('returns 200 with items and total', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/discovery/browse')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('returns 200 when filtered by categoryId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/discovery/browse?categoryId=${categoryId}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
    });

    it('returns 200 when filtered by tags', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/podcasts/${podcastId}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ tags: ['tech', 'innovation'] });

      const res = await request(app.getHttpServer())
        .get('/api/v1/discovery/browse?tags=tech')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe('GET /discovery/search', () => {
    it('returns 200 with podcasts and episodes arrays', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/discovery/search?q=Discovery')
        .expect(200);

      expect(res.body).toHaveProperty('podcasts');
      expect(res.body).toHaveProperty('episodes');
      expect(Array.isArray(res.body.podcasts)).toBe(true);
      expect(Array.isArray(res.body.episodes)).toBe(true);
    });

    it('returns 400 when q is missing', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/discovery/search')
        .expect(400);
    });

    it('returns 200 when filtered by tags', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/discovery/search?q=Discovery&tags=tech')
        .expect(200);

      expect(res.body).toHaveProperty('podcasts');
      expect(res.body).toHaveProperty('episodes');
    });
  });

  describe('GET /discovery/trending', () => {
    it('returns 200 with items and total', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/discovery/trending')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe('GET /discovery/new-releases', () => {
    it('returns 200 with items and total', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/discovery/new-releases')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe('GET /discovery/featured', () => {
    it('returns 200 with items and total', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/discovery/featured')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe('GET /discovery/recommendations', () => {
    it('returns 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/discovery/recommendations')
        .expect(401);
    });

    it('returns 200 with items and total when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/discovery/recommendations')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });
});
