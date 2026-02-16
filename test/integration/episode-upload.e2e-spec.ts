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

/**
 * Integration test: Upload episode → add metadata → publish → verify in episode list
 */
describe('Episode Upload (Integration)', () => {
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
            url: 'https://example.com/covers/ep.jpg',
            key: 'covers/ep.jpg',
          }),
        deleteByKey: () => Promise.resolve(),
      })
      .overrideProvider(AudioUploadService)
      .useValue({
        uploadAudio: () =>
          Promise.resolve({
            url: 'https://example.com/audio/integration.mp3',
            key: 'episodes/int.mp3',
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
    const userId = new Types.ObjectId();
    await users.insertOne({
      _id: userId,
      username: `ep_upload_${Date.now()}`,
      email: `ep_upload_${Date.now()}@test.com`,
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
      .field('title', 'Episode Upload Test Podcast')
      .field('categoryId', categoryId)
      .field('language', 'en')
      .attach('cover', Buffer.from('fake'), {
        filename: 'cover.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    podcastId = createPodcastRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/podcasts/${podcastId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ status: 'published' })
      .expect(200);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('upload episode → publish → verify in episode list', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/podcasts/${podcastId}/episodes`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .field('title', 'Integration Test Episode')
      .field('description', 'Show notes for integration test')
      .field('duration', '300')
      .field('status', 'draft')
      .attach('audio', Buffer.from('fake mp3'), {
        filename: 'ep.mp3',
        contentType: 'audio/mpeg',
      })
      .expect(201);

    episodeId = createRes.body.id;
    expect(episodeId).toBeDefined();
    expect(createRes.body.status).toBe('draft');
    expect(createRes.body.title).toBe('Integration Test Episode');

    const listDraftRes = await request(app.getHttpServer())
      .get(`/api/v1/podcasts/${podcastId}/episodes`)
      .query({ status: 'draft' })
      .expect(200);

    expect(
      listDraftRes.body.items.some((ep: { id: string }) => ep.id === episodeId),
    ).toBe(true);

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/episodes/${episodeId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ status: 'published' })
      .expect(200);

    expect(patchRes.body.status).toBe('published');

    const listPublishedRes = await request(app.getHttpServer())
      .get(`/api/v1/podcasts/${podcastId}/episodes`)
      .query({ status: 'published' })
      .expect(200);

    expect(
      listPublishedRes.body.items.some(
        (ep: { id: string }) => ep.id === episodeId,
      ),
    ).toBe(true);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/episodes/${episodeId}`)
      .expect(200);

    expect(getRes.body.title).toBe('Integration Test Episode');
    expect(getRes.body.status).toBe('published');
  });
});
