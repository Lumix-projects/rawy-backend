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

describe('Podcasts RSS (Contract)', () => {
  let app: INestApplication<App>;
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
            url: 'https://example.com/covers/test.jpg',
            key: 'covers/test.jpg',
          }),
        deleteByKey: () => Promise.resolve(),
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

    const cat = await categories.findOne({ slug: 'tech' });
    if (!cat) {
      await categories.insertOne({ slug: 'tech', name: 'Technology' });
    }
    const catDoc = await categories.findOne({ slug: 'tech' });
    categoryId = catDoc!._id.toString();

    const passwordHash = await bcrypt.hash('TestPassword123!', 12);
    const userId = new Types.ObjectId();
    await users.insertOne({
      _id: userId,
      username: `rss_creator_${Date.now()}`,
      email: `rss_creator_${Date.now()}@test.com`,
      passwordHash,
      role: 'creator',
      emailVerified: true,
    });
    creatorId = userId.toString();

    const secret = configService.get('JWT_SECRET', 'change-me-in-production');
    creatorToken = jwtService.sign(
      { sub: creatorId, email: 'creator@test.com' },
      { secret, expiresIn: '15m' },
    );

    const podcastDoc = await podcasts.insertOne({
      ownerId: userId,
      title: 'RSS Test Podcast',
      description: 'For RSS contract test',
      categoryId: new Types.ObjectId(categoryId),
      subcategoryId: null,
      coverUrl: 'https://example.com/cover.jpg',
      language: 'en',
      tags: [],
      status: 'published',
      archivedAt: null,
      explicit: false,
      episodeOrder: 'newest_first',
      websiteUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    podcastId = podcastDoc.insertedId.toString();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /podcasts/:podcastId/rss', () => {
    it('returns 200 with application/rss+xml and valid RSS 2.0 structure', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/podcasts/${podcastId}/rss`)
        .expect(200)
        .expect('Content-Type', /application\/rss\+xml/);

      expect(res.text).toContain('<?xml version="1.0"');
      expect(res.text).toContain('<rss version="2.0"');
      expect(res.text).toContain('<channel>');
      expect(res.text).toContain('<title>RSS Test Podcast</title>');
      expect(res.text).toContain('</channel>');
      expect(res.text).toContain('</rss>');
    });

    it('returns 404 for non-existent podcast', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/podcasts/000000000000000000000000/rss')
        .expect(404);
    });

    it('returns 404 for draft podcast', async () => {
      const conn = app.get(getConnectionToken());
      const podcasts = conn.db.collection('podcasts');
      const draft = await podcasts.insertOne({
        ownerId: new Types.ObjectId(creatorId),
        title: 'Draft Podcast',
        categoryId: new Types.ObjectId(categoryId),
        subcategoryId: null,
        coverUrl: 'https://example.com/cover.jpg',
        language: 'en',
        tags: [],
        status: 'draft',
        archivedAt: null,
        explicit: false,
        episodeOrder: 'newest_first',
        websiteUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await request(app.getHttpServer())
        .get(`/api/v1/podcasts/${draft.insertedId}/rss`)
        .expect(404);
    });
  });
});
