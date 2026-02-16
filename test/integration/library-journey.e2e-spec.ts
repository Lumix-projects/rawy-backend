import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { getConnectionToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { CoverUploadService } from '../../src/shared/upload/upload.service';
import { AudioUploadService } from '../../src/shared/upload/audio-upload.service';
import { UploadRateLimitService } from '../../src/shared/rate-limit/upload-rate-limit.service';

/**
 * Integration test: subscribe → list subscriptions → bookmark episode →
 * create playlist → add episode → view history
 */
describe('Library Journey (Integration)', () => {
  let app: INestApplication<App>;
  let creatorToken: string;
  let listenerToken: string;
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
            url: 'https://example.com/covers/journey.jpg',
            key: 'covers/journey.jpg',
          }),
        deleteByKey: () => Promise.resolve(),
      })
      .overrideProvider(AudioUploadService)
      .useValue({
        uploadAudio: () =>
          Promise.resolve({
            url: 'https://example.com/audio/journey-ep.mp3',
            key: 'episodes/journey-ep.mp3',
          }),
        deleteByKey: () => Promise.resolve(),
        getPresignedStreamUrl: (key: string) =>
          Promise.resolve(`https://presigned.example.com/stream/${key}`),
        getPresignedDownloadUrl: (key: string) =>
          Promise.resolve(`https://presigned.example.com/download/${key}`),
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
    const secret = configService.get('JWT_SECRET', 'change-me-in-production');

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
      username: `lib_journey_creator_${Date.now()}`,
      email: `lib_journey_creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });
    creatorId = creatorUserId.toString();

    const listenerUserId = new Types.ObjectId();
    await users.insertOne({
      _id: listenerUserId,
      username: `lib_journey_listener_${Date.now()}`,
      email: `lib_journey_listener_${Date.now()}@test.com`,
      passwordHash,
      role: 'listener',
      emailVerified: true,
    });
    listenerId = listenerUserId.toString();

    creatorToken = jwtService.sign(
      { sub: creatorId, email: 'creator@test.com' },
      { secret, expiresIn: '15m' },
    );
    listenerToken = jwtService.sign(
      { sub: listenerId, email: 'listener@test.com' },
      { secret, expiresIn: '15m' },
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('subscribe → list subscriptions → bookmark → playlist → add episode → view history', async () => {
    const createPodcastRes = await request(app.getHttpServer())
      .post('/api/v1/podcasts')
      .set('Authorization', `Bearer ${creatorToken}`)
      .field('title', 'Library Journey Podcast')
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

    const createEpisodeRes = await request(app.getHttpServer())
      .post(`/api/v1/podcasts/${podcastId}/episodes`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .field('title', 'Library Journey Episode')
      .field('duration', '300')
      .attach('audio', Buffer.from('fake'), {
        filename: 'ep.mp3',
        contentType: 'audio/mpeg',
      })
      .expect(201);
    episodeId = createEpisodeRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/episodes/${episodeId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ status: 'published' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${listenerToken}`)
      .send({ podcastId })
      .expect(201);

    const subsRes = await request(app.getHttpServer())
      .get('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${listenerToken}`)
      .expect(200);
    expect(subsRes.body.items).toBeDefined();
    expect(Array.isArray(subsRes.body.items)).toBe(true);
    expect(
      subsRes.body.items.some((p: { id: string }) => p.id === podcastId),
    ).toBe(true);

    await request(app.getHttpServer())
      .post('/api/v1/library/bookmarks')
      .set('Authorization', `Bearer ${listenerToken}`)
      .send({ episodeId })
      .expect(201);

    const bookmarksRes = await request(app.getHttpServer())
      .get('/api/v1/library/bookmarks')
      .set('Authorization', `Bearer ${listenerToken}`)
      .expect(200);
    expect(bookmarksRes.body.items).toBeDefined();
    expect(
      bookmarksRes.body.items.some((e: { id: string }) => e.id === episodeId),
    ).toBe(true);

    const createPlaylistRes = await request(app.getHttpServer())
      .post('/api/v1/playlists')
      .set('Authorization', `Bearer ${listenerToken}`)
      .send({ name: 'My Queue' })
      .expect(201);
    const playlistId = createPlaylistRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${listenerToken}`)
      .send({ episodeIds: [episodeId] })
      .expect(200);

    const playlistRes = await request(app.getHttpServer())
      .get(`/api/v1/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${listenerToken}`)
      .expect(200);
    expect(playlistRes.body.episodeIds).toContain(episodeId);

    await request(app.getHttpServer())
      .put('/api/v1/playback/progress')
      .set('Authorization', `Bearer ${listenerToken}`)
      .send({ episodeId, positionSeconds: 45 })
      .expect(200);

    const historyRes = await request(app.getHttpServer())
      .get('/api/v1/library/history')
      .set('Authorization', `Bearer ${listenerToken}`)
      .expect(200);
    expect(historyRes.body.items).toBeDefined();
    expect(Array.isArray(historyRes.body.items)).toBe(true);
    expect(
      historyRes.body.items.some((e: { id: string }) => e.id === episodeId),
    ).toBe(true);
  });
});
