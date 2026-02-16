import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PlayEvent, PlayEventDocument } from '../playback/schemas/play-event.schema';
import {
  DownloadEvent,
  DownloadEventDocument,
} from '../playback/schemas/download-event.schema';
import { Episode, EpisodeDocument } from '../episodes/schemas/episode.schema';
import {
  Podcast,
  PodcastDocument,
} from '../podcasts/schemas/podcast.schema';
import {
  Subscription,
  SubscriptionDocument,
} from '../subscriptions/schemas/subscription.schema';

export interface PodcastAnalytics {
  totalPlays: number;
  uniqueListeners: number;
  avgListeningDuration: number;
  subscriberGrowth: { date: string; count: number }[];
  downloads: number;
  topEpisodes: { episodeId: string; plays: number; title?: string }[];
  geography: Record<string, number>;
  devices: Record<string, number>;
}

export interface EpisodeAnalytics {
  plays: number;
  uniqueListeners: number;
  avgListeningDuration: number;
  downloads: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(PlayEvent.name)
    private readonly playEventModel: Model<PlayEventDocument>,
    @InjectModel(DownloadEvent.name)
    private readonly downloadEventModel: Model<DownloadEventDocument>,
    @InjectModel(Episode.name)
    private readonly episodeModel: Model<EpisodeDocument>,
    @InjectModel(Podcast.name)
    private readonly podcastModel: Model<PodcastDocument>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  async getPodcastAnalytics(
    podcastId: string,
    ownerId: Types.ObjectId,
    from?: string,
    to?: string,
  ): Promise<PodcastAnalytics> {
    const podcast = await this.podcastModel.findById(podcastId).exec();
    if (!podcast) {
      throw new NotFoundException('Podcast not found');
    }
    if (!podcast.ownerId.equals(ownerId)) {
      throw new ForbiddenException('Not the owner of this podcast');
    }

    const podcastObjId = new Types.ObjectId(podcastId);
    const dateFilter = this.buildDateFilter(from, to);

    const [
      playAgg,
      downloadCount,
      subGrowth,
      topEpisodesAgg,
      geoAgg,
      deviceAgg,
    ] = await Promise.all([
      this.aggregatePlayEventsForPodcast(podcastObjId, dateFilter),
      this.aggregateDownloadsForPodcast(podcastObjId, dateFilter),
      this.aggregateSubscriberGrowth(podcastObjId, dateFilter),
      this.aggregateTopEpisodes(podcastObjId, dateFilter),
      this.aggregateGeography(podcastObjId, dateFilter),
      this.aggregateDevices(podcastObjId, dateFilter),
    ]);

    return {
      totalPlays: playAgg.totalPlays,
      uniqueListeners: playAgg.uniqueListeners,
      avgListeningDuration: playAgg.avgListeningDuration,
      subscriberGrowth: subGrowth,
      downloads: downloadCount,
      topEpisodes: topEpisodesAgg,
      geography: geoAgg,
      devices: deviceAgg,
    };
  }

  async getEpisodeAnalytics(
    episodeId: string,
    userId: Types.ObjectId,
  ): Promise<EpisodeAnalytics> {
    const episode = await this.episodeModel
      .findById(episodeId)
      .populate('podcastId', 'ownerId')
      .exec();
    if (!episode) {
      throw new NotFoundException('Episode not found');
    }

    const podcast = episode.podcastId as unknown as { ownerId: Types.ObjectId };
    if (!podcast?.ownerId?.equals(userId)) {
      throw new ForbiddenException('Not the owner of this episode\'s podcast');
    }

    const episodeObjId = new Types.ObjectId(episodeId);

    const [playAgg, downloadCount] = await Promise.all([
      this.aggregatePlayEventsForEpisode(episodeObjId),
      this.downloadEventModel
        .countDocuments({ episodeId: episodeObjId })
        .exec(),
    ]);

    return {
      plays: playAgg.totalPlays,
      uniqueListeners: playAgg.uniqueListeners,
      avgListeningDuration: playAgg.avgListeningDuration,
      downloads: downloadCount,
    };
  }

  private buildDateFilter(
    from?: string,
    to?: string,
  ): { createdAt?: { $gte?: Date; $lte?: Date } } {
    const filter: { createdAt?: { $gte?: Date; $lte?: Date } } = {};
    if (from || to) {
      filter.createdAt = {};
      if (from) {
        filter.createdAt.$gte = new Date(from);
      }
      if (to) {
        filter.createdAt.$lte = new Date(to);
      }
    }
    return Object.keys(filter).length ? filter : {};
  }

  private async aggregatePlayEventsForPodcast(
    podcastId: Types.ObjectId,
    dateFilter: Record<string, unknown>,
  ): Promise<{
    totalPlays: number;
    uniqueListeners: number;
    avgListeningDuration: number;
  }> {
    const match: Record<string, unknown> = { podcastId, ...dateFilter };
    const [result] = await this.playEventModel
      .aggregate<{
        totalPlays: number;
        uniqueListeners: number;
        avgListeningDuration: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: null,
            totalPlays: { $sum: 1 },
            uniqueListeners: { $addToSet: '$userId' },
            totalSeconds: { $sum: '$listenedSeconds' },
          },
        },
        {
          $project: {
            totalPlays: 1,
            uniqueListeners: { $size: { $ifNull: ['$uniqueListeners', []] } },
            avgListeningDuration: {
              $cond: [
                { $eq: ['$totalPlays', 0] },
                0,
                { $divide: ['$totalSeconds', '$totalPlays'] },
              ],
            },
          },
        },
      ])
      .exec();

    return result ?? { totalPlays: 0, uniqueListeners: 0, avgListeningDuration: 0 };
  }

  private async aggregatePlayEventsForEpisode(
    episodeId: Types.ObjectId,
  ): Promise<{
    totalPlays: number;
    uniqueListeners: number;
    avgListeningDuration: number;
  }> {
    const [result] = await this.playEventModel
      .aggregate<{
        totalPlays: number;
        uniqueListeners: number;
        avgListeningDuration: number;
      }>([
        { $match: { episodeId } },
        {
          $group: {
            _id: null,
            totalPlays: { $sum: 1 },
            uniqueListeners: { $addToSet: '$userId' },
            totalSeconds: { $sum: '$listenedSeconds' },
          },
        },
        {
          $project: {
            totalPlays: 1,
            uniqueListeners: { $size: { $ifNull: ['$uniqueListeners', []] } },
            avgListeningDuration: {
              $cond: [
                { $eq: ['$totalPlays', 0] },
                0,
                { $divide: ['$totalSeconds', '$totalPlays'] },
              ],
            },
          },
        },
      ])
      .exec();

    return result ?? { totalPlays: 0, uniqueListeners: 0, avgListeningDuration: 0 };
  }

  private async aggregateDownloadsForPodcast(
    podcastId: Types.ObjectId,
    dateFilter: Record<string, unknown>,
  ): Promise<number> {
    const episodeIds = await this.episodeModel
      .find({ podcastId }, { _id: 1 })
      .lean()
      .exec();
    const ids = episodeIds.map((e) => e._id);
    if (ids.length === 0) return 0;

    const match: Record<string, unknown> = {
      episodeId: { $in: ids },
      ...dateFilter,
    };
    return this.downloadEventModel.countDocuments(match).exec();
  }

  private async aggregateSubscriberGrowth(
    podcastId: Types.ObjectId,
    dateFilter: Record<string, unknown>,
  ): Promise<{ date: string; count: number }[]> {
    const match: Record<string, unknown> = { podcastId, ...dateFilter };
    const results = await this.subscriptionModel
      .aggregate<{ date: string; count: number }>([
        { $match: match },
        {
          $group: {
            _id: {
              date: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
        {
          $project: {
            date: '$_id.date',
            count: 1,
            _id: 0,
          },
        },
      ])
      .exec();

    return results;
  }

  private async aggregateTopEpisodes(
    podcastId: Types.ObjectId,
    dateFilter: Record<string, unknown>,
  ): Promise<{ episodeId: string; plays: number; title?: string }[]> {
    const match: Record<string, unknown> = { podcastId, ...dateFilter };
    const results = await this.playEventModel
      .aggregate<{ episodeId: Types.ObjectId; plays: number }>([
        { $match: match },
        { $group: { _id: '$episodeId', plays: { $sum: 1 } } },
        { $sort: { plays: -1 } },
        { $limit: 10 },
        {
          $project: {
            episodeId: '$_id',
            plays: 1,
            _id: 0,
          },
        },
      ])
      .exec();

    if (results.length === 0) return [];

    const episodeIds = results.map((r) => r.episodeId);
    const episodes = await this.episodeModel
      .find({ _id: { $in: episodeIds } }, { _id: 1, title: 1 })
      .lean()
      .exec();
    const episodeMap = new Map(
      episodes.map((e) => [e._id.toString(), e.title ?? '']),
    );

    return results.map((r) => ({
      episodeId: r.episodeId.toString(),
      plays: r.plays,
      title: episodeMap.get(r.episodeId.toString()),
    }));
  }

  private async aggregateGeography(
    podcastId: Types.ObjectId,
    dateFilter: Record<string, unknown>,
  ): Promise<Record<string, number>> {
    const match: Record<string, unknown> = {
      podcastId,
      geoCountry: { $exists: true, $nin: [null, ''] },
      ...dateFilter,
    };
    const results = await this.playEventModel
      .aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $group: { _id: '$geoCountry', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .exec();

    const geography: Record<string, number> = {};
    for (const r of results) {
      if (r._id) geography[r._id] = r.count;
    }
    return geography;
  }

  private async aggregateDevices(
    podcastId: Types.ObjectId,
    dateFilter: Record<string, unknown>,
  ): Promise<Record<string, number>> {
    const match: Record<string, unknown> = {
      podcastId,
      deviceInfo: { $exists: true, $nin: [null, ''] },
      ...dateFilter,
    };
    const results = await this.playEventModel
      .aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $group: { _id: '$deviceInfo', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .exec();

    const devices: Record<string, number> = {};
    for (const r of results) {
      if (r._id) devices[r._id] = r.count;
    }
    return devices;
  }

  async getPlatformAnalytics(
    from?: string,
    to?: string,
  ): Promise<{
    totalPodcasts: number;
    publishedPodcasts: number;
    totalEpisodes: number;
    publishedEpisodes: number;
    totalPlays: number;
    totalDownloads: number;
    totalSubscriptions: number;
    playGrowth: { date: string; count: number }[];
  }> {
    const dateFilter = this.buildDateFilter(from, to);

    const [
      totalPodcasts,
      publishedPodcasts,
      totalEpisodes,
      publishedEpisodes,
      playStats,
      downloadCount,
      subCount,
      playGrowth,
    ] = await Promise.all([
      this.podcastModel.countDocuments().exec(),
      this.podcastModel.countDocuments({ status: 'published' }).exec(),
      this.episodeModel.countDocuments().exec(),
      this.episodeModel
        .countDocuments({ status: 'published' })
        .exec(),
      this.playEventModel
        .aggregate<{ totalPlays: number }>([
          { $match: dateFilter },
          { $group: { _id: null, totalPlays: { $sum: 1 } } },
        ])
        .exec(),
      this.downloadEventModel
        .countDocuments(dateFilter)
        .exec(),
      this.subscriptionModel
        .countDocuments()
        .exec(),
      this.playEventModel
        .aggregate<{ date: string; count: number }>([
          { $match: dateFilter },
          {
            $group: {
              _id: {
                date: {
                  $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { '_id.date': 1 } },
          {
            $project: {
              date: '$_id.date',
              count: 1,
              _id: 0,
            },
          },
        ])
        .exec(),
    ]);

    const playAgg = playStats[0];

    return {
      totalPodcasts,
      publishedPodcasts,
      totalEpisodes,
      publishedEpisodes,
      totalPlays: playAgg?.totalPlays ?? 0,
      totalDownloads: downloadCount,
      totalSubscriptions: subCount,
      playGrowth: playGrowth ?? [],
    };
  }
}
