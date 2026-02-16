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

describe('Playlists Controller (Contract)', () => {
  let app: INestApplication<App>;
  let listenerToken: string;
  let creatorToken: string;
  let categoryId: string;
  let podcastId: string;
  let episodeId: string;
  let playlistId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CoverUploadService)
      .useValue({
        uploadCover: () =>
          Promise.resolve({
            url: 'https://example.com/covers/pl.jpg',
            key: 'covers/pl.jpg',
          }),
        deleteByKey: () => Promise.resolve(),
      })
      .overrideProvider(AudioUploadService)
      .useValue({
        uploadAudio: () =>
          Promise.resolve({
            url: 'https://example.com/audio/pl-ep.mp3',
            key: 'episodes/pl-ep.mp3',
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
      username: `pl_creator_${Date.now()}`,
      email: `pl_creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });

    const listenerUserId = new Types.ObjectId();
    await users.insertOne({
      _id: listenerUserId,
      username: `pl_listener_${Date.now()}`,
      email: `pl_listener_${Date.now()}@test.com`,
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
      .field('title', 'Playlist Test Podcast')
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
      .field('title', 'Playlist Episode')
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

  describe('POST /playlists', () => {
    it('returns 201 when creating playlist', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/playlists')
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ name: 'My Favorites' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name', 'My Favorites');
      expect(res.body).toHaveProperty('episodeIds');
      expect(res.body).toHaveProperty('episodes');
      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).toHaveProperty('updatedAt');
      playlistId = res.body.id;
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/playlists')
        .send({ name: 'Untitled' })
        .expect(401);
    });
  });

  describe('GET /playlists', () => {
    it('returns 200 with array of playlists', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/playlists')
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer()).get('/api/v1/playlists').expect(401);
    });
  });

  describe('GET /playlists/:playlistId', () => {
    it('returns 200 with playlist details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/playlists/${playlistId}`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', playlistId);
      expect(res.body).toHaveProperty('name');
      expect(res.body).toHaveProperty('episodeIds');
      expect(res.body).toHaveProperty('episodes');
    });

    it('returns 404 for non-existent playlist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/playlists/000000000000000000000000')
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(404);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/playlists/${playlistId}`)
        .expect(401);
    });
  });

  describe('PATCH /playlists/:playlistId', () => {
    it('returns 200 when updating playlist name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/playlists/${playlistId}`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ name: 'Updated Favorites' })
        .expect(200);

      expect(res.body).toHaveProperty('name', 'Updated Favorites');
    });

    it('returns 200 when adding episodes', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/playlists/${playlistId}`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .send({ episodeIds: [episodeId] })
        .expect(200);

      expect(res.body).toHaveProperty('episodeIds');
      expect(res.body.episodeIds).toContain(episodeId);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/playlists/${playlistId}`)
        .send({ name: 'Other' })
        .expect(401);
    });
  });

  describe('DELETE /playlists/:playlistId', () => {
    it('returns 204 when deleting playlist', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/playlists/${playlistId}`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(204);
    });

    it('returns 404 for non-existent playlist', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/playlists/${playlistId}`)
        .set('Authorization', `Bearer ${listenerToken}`)
        .expect(404);
    });

    it('returns 401 when no token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/playlists/${playlistId}`)
        .expect(401);
    });
  });
});
