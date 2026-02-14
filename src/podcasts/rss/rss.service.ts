import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PodcastDocument } from '../schemas/podcast.schema';

const CACHE_TTL_SECONDS = 300; // 5 minutes
const CACHE_KEY_PREFIX = 'rss:';

export interface RssItem {
  title: string;
  description?: string;
  audioUrl: string;
  audioLength?: number;
  publishedAt: Date;
  guid: string;
  duration?: number; // seconds for podcast namespace
}

@Injectable()
export class RssService {
  private readonly redis: Redis | null;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get('REDIS_URL', '');
    const useRedis =
      redisUrl && redisUrl !== 'memory' && !redisUrl.startsWith('skip');
    this.redis = useRedis ? new Redis(redisUrl) : null;
    const port = this.configService.get('PORT', '3000');
    this.baseUrl = this.configService.get(
      'API_BASE_URL',
      `http://localhost:${port}/api/v1`,
    );
  }

  async generateFeed(
    podcast: PodcastDocument,
    items: RssItem[] = [],
  ): Promise<string> {
    const cacheKey = `${CACHE_KEY_PREFIX}${podcast._id}`;
    if (this.redis && items.length > 0) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const xml = this.buildRssXml(podcast, items);

    if (this.redis) {
      await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, xml);
    }

    return xml;
  }

  invalidateCache(podcastId: string): void {
    if (this.redis) {
      this.redis.del(`${CACHE_KEY_PREFIX}${podcastId}`).catch(() => {});
    }
  }

  private buildRssXml(podcast: PodcastDocument, items: RssItem[]): string {
    const title = this.escapeXml(podcast.title);
    const description = this.escapeXml(podcast.description || podcast.title);
    const link = podcast.websiteUrl || this.baseUrl;
    const language = podcast.language || 'en';

    const channelImage = podcast.coverUrl
      ? `    <image>
      <url>${this.escapeXml(podcast.coverUrl)}</url>
      <title>${title}</title>
      <link>${this.escapeXml(link)}</link>
    </image>`
      : '';

    const itemsXml = items
      .map(
        (item) => `    <item>
      <title>${this.escapeXml(item.title)}</title>
      <description>${this.escapeXml(item.description || '')}</description>
      <link>${this.escapeXml(link)}</link>
      <guid isPermaLink="false">${this.escapeXml(item.guid)}</guid>
      <pubDate>${item.publishedAt.toUTCString()}</pubDate>
      <enclosure url="${this.escapeXml(item.audioUrl)}" length="${item.audioLength ?? 0}" type="audio/mpeg"/>
${item.duration != null ? `      <itunes:duration>${Math.floor(item.duration)}</itunes:duration>` : ''}
    </item>`,
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${title}</title>
    <description>${description}</description>
    <link>${this.escapeXml(link)}</link>
    <language>${language}</language>
${channelImage}
${itemsXml}
  </channel>
</rss>`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
