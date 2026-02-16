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

describe('Reports Controller (Contract)', () => {
  let app: INestApplication<App>;
  let listenerToken: string;
  let creatorToken: string;
  let creatorId: string;
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
            url: 'https://example.com/covers/report.jpg',
            key: 'covers/report.jpg',
          }),
        deleteByKey: () => Promise.resolve(),
      })
      .overrideProvider(AudioUploadService)
      .useValue({
        uploadAudio: () =>
          Promise.resolve({
            url: 'https://example.com/audio/report-ep.mp3',
            key: 'episodes/report-ep.mp3',
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

    const cat = await categories.findOne({ slug: 'tech' });
    if (cat) {
      categoryId = cat._id.toString();
    } else {
      await categories.insertOne({ slug: 'tech', name: 'Technology' });
      const inserted = await categories.findOne({ slug: 'tech' });
      categoryId = inserted!._id.toString();
    }

    const passwordHash = await bcrypt.hash('TestPassword123!', 12);

    const creatorUserId = new Types.ObjectId();
    await users.insertOne({
      _id: creatorUserId,
      username: `report_creator_${Date.now()}`,
      email: `report_creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });
    creatorId = creatorUserId.toString();

    const listenerUserId = new Types.ObjectId();
    await users.insertOne({
      _id: listenerUserId,
      username: `report_listener_${Date.now()}`,
      email: `report_listener_${Date.now()}@test.com`,
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
      .field('title', 'Report Test Podcast')
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
      .field('title', 'Report Test Episode')
      .field('status', 'published')
      .attach('audio', Buffer.from('fake'), {
        filename: 'ep.mp3',
        contentType: 'audio/mpeg',
      });
    episodeId = createEpisodeRes.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /reports', () => {
    it('returns 201 when reporting a podcast', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({
          targetType: 'podcast',
          targetId: podcastId,
          reason: 'Inappropriate content',
        })
        .expect(201);
      expect(res.body).toBeDefined();
    });

    it('returns 201 when reporting an episode', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({
          targetType: 'episode',
          targetId: episodeId,
          reason: 'Spam',
        })
        .expect(201);
      expect(res.body).toBeDefined();
    });

    it('returns 400 when targetType invalid', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({
          targetType: 'invalid',
          targetId: podcastId,
        })
        .expect(400);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/reports')
        .send({
          targetType: 'podcast',
          targetId: podcastId,
        })
        .expect(401);
    });
  });
});
