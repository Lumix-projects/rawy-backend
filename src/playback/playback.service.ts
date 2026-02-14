import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EpisodeDocument } from '../episodes/schemas/episode.schema';
import { ListeningProgress, ListeningProgressDocument } from './schemas/listening-progress.schema';
import { PlayEvent, PlayEventDocument } from './schemas/play-event.schema';
import { DownloadEvent, DownloadEventDocument } from './schemas/download-event.schema';
import { EpisodesService } from '../episodes/episodes.service';
import { PodcastsService } from '../podcasts/podcasts.service';
import { AudioUploadService } from '../shared/upload/audio-upload.service';

const ARCHIVED_GRACE_DAYS = 30;
const PRESIGNED_EXPIRY_SEC = 3600;

@Injectable()
export class PlaybackService {
  constructor(
    @InjectModel(ListeningProgress.name)
    private readonly progressModel: Model<ListeningProgressDocument>,
    @InjectModel(PlayEvent.name)
    private readonly playEventModel: Model<PlayEventDocument>,
    @InjectModel(DownloadEvent.name)
    private readonly downloadEventModel: Model<DownloadEventDocument>,
    private readonly episodesService: EpisodesService,
    private readonly podcastsService: PodcastsService,
    private readonly audioUploadService: AudioUploadService,
  ) {}

  private async canAccessStream(
    episode: EpisodeDocument,
    _userId: Types.ObjectId,
  ): Promise<void> {
    if (episode.status === 'published') {
      return;
    }
    if (episode.status === 'archived' && episode.archivedAt) {
      const graceEnd = new Date(episode.archivedAt);
      graceEnd.setDate(graceEnd.getDate() + ARCHIVED_GRACE_DAYS);
      if (new Date() <= graceEnd) return;
    }
    const podcastId =
      typeof episode.podcastId === 'object' && episode.podcastId && '_id' in episode.podcastId
        ? (episode.podcastId as { _id: Types.ObjectId })._id
        : episode.podcastId;
    const podcast = await this.podcastsService.findById(podcastId);
    if (podcast?.status === 'archived' && podcast.archivedAt) {
      const graceEnd = new Date(podcast.archivedAt);
      graceEnd.setDate(graceEnd.getDate() + ARCHIVED_GRACE_DAYS);
      if (new Date() <= graceEnd) return;
    }
    throw new ForbiddenException(
      'Access denied (archived beyond 30 days or not available)',
    );
  }

  async getStreamUrl(
    episodeId: string,
    userId: Types.ObjectId,
  ): Promise<{ url: string; expiresIn: number }> {
    const episode = await this.episodesService.findByIdOrThrow(episodeId);
    await this.canAccessStream(episode, userId);

    const presigned = await this.audioUploadService.getPresignedStreamUrl(
      episode.audioUrl,
      PRESIGNED_EXPIRY_SEC,
    );
    if (!presigned) {
      throw new BadRequestException('Stream URL generation failed. S3 may not be configured.');
    }
    return { url: presigned, expiresIn: PRESIGNED_EXPIRY_SEC };
  }

  async getDownloadUrl(
    episodeId: string,
    userId: Types.ObjectId,
  ): Promise<{ url: string; expiresIn: number }> {
    const episode = await this.episodesService.findByIdOrThrow(episodeId);
    await this.canAccessStream(episode, userId);

    const presigned = await this.audioUploadService.getPresignedDownloadUrl(
      episode.audioUrl,
      PRESIGNED_EXPIRY_SEC,
    );
    if (!presigned) {
      throw new BadRequestException('Download URL generation failed. S3 may not be configured.');
    }

    await this.downloadEventModel.create({
      episodeId: episode._id,
      userId,
    });
    return { url: presigned, expiresIn: PRESIGNED_EXPIRY_SEC };
  }

  async upsertProgress(
    userId: Types.ObjectId,
    episodeId: string,
    positionSeconds: number,
  ): Promise<void> {
    const episode = await this.episodesService.findById(episodeId);
    if (!episode) {
      throw new NotFoundException('Episode not found');
    }

    await this.progressModel.updateOne(
      { userId, episodeId: new Types.ObjectId(episodeId) },
      { $set: { positionSeconds, updatedAt: new Date() } },
      { upsert: true },
    ).exec();
  }

  async getProgress(
    userId: Types.ObjectId,
    episodeIds: string[],
  ): Promise<Record<string, number>> {
    if (!episodeIds.length) return {};
    const items = await this.progressModel
      .find({
        userId,
        episodeId: { $in: episodeIds.map((id) => new Types.ObjectId(id)) },
      })
      .exec();
    const result: Record<string, number> = {};
    for (const p of items) {
      result[p.episodeId.toString()] = p.positionSeconds;
    }
    return result;
  }

  async recordPlay(
    episodeId: string,
    userId: Types.ObjectId,
    data?: { listenedSeconds?: number; deviceInfo?: string },
  ): Promise<void> {
    const episode = await this.episodesService.findByIdOrThrow(episodeId);
    const podcastId =
      typeof episode.podcastId === 'object' && episode.podcastId && '_id' in episode.podcastId
        ? (episode.podcastId as { _id: Types.ObjectId })._id
        : episode.podcastId;

    await this.playEventModel.create({
      episodeId: episode._id,
      podcastId,
      userId,
      listenedSeconds: data?.listenedSeconds ?? 0,
      deviceInfo: data?.deviceInfo ?? null,
    });
  }
}
