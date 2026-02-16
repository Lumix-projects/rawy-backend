import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Episode, EpisodeDocument } from './schemas/episode.schema';
import { PodcastDocument } from '../podcasts/schemas/podcast.schema';
import { CreateEpisodeDto } from './dto/create-episode.dto';
import { UpdateEpisodeDto } from './dto/update-episode.dto';
import { AudioUploadService } from '../shared/upload/audio-upload.service';
import { CoverUploadService } from '../shared/upload/upload.service';
import { UploadRateLimitService } from '../shared/rate-limit/upload-rate-limit.service';
import { PodcastsService } from '../podcasts/podcasts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

export interface CreateEpisodeInput {
  podcastId: string;
  dto: CreateEpisodeDto;
  ownerId: Types.ObjectId;
  audio: { buffer: Buffer; mimetype: string; size: number };
  cover?: { buffer: Buffer; mimetype: string; size: number };
}

export interface UpdateEpisodeInput {
  dto: UpdateEpisodeDto;
  cover?: { buffer: Buffer; mimetype: string; size: number };
}

const MIME_TO_FORMAT: Record<string, 'mp3' | 'wav' | 'm4a'> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
};

@Injectable()
export class EpisodesService {
  private readonly logger = new Logger(EpisodesService.name);

  constructor(
    @InjectModel(Episode.name)
    private readonly episodeModel: Model<EpisodeDocument>,
    private readonly audioUploadService: AudioUploadService,
    private readonly coverUploadService: CoverUploadService,
    private readonly uploadRateLimitService: UploadRateLimitService,
    @Inject(forwardRef(() => PodcastsService))
    private readonly podcastsService: PodcastsService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async create(input: CreateEpisodeInput): Promise<EpisodeDocument> {
    const { podcastId, dto, ownerId, audio } = input;

    const podcast = await this.podcastsService.findByIdOrThrow(podcastId);
    if (!podcast.ownerId.equals(ownerId)) {
      throw new ForbiddenException('Not the owner of this podcast');
    }

    await this.uploadRateLimitService.checkAndIncrement(ownerId.toString());

    const uploadResult = await this.audioUploadService.uploadAudio(
      audio,
      `episodes/${podcastId}`,
    );
    if (!uploadResult) {
      throw new BadRequestException(
        'Audio upload failed. S3 may not be configured.',
      );
    }

    let coverUrl: string | null = null;
    if (input.cover) {
      const coverResult = await this.coverUploadService.uploadCover(
        input.cover,
      );
      if (coverResult) {
        coverUrl = coverResult.url;
      }
    }
    if (!coverUrl && podcast.coverUrl) {
      coverUrl = podcast.coverUrl;
    }

    const audioFormat = MIME_TO_FORMAT[audio.mimetype] ?? 'mp3';
    let duration = dto.duration ?? 0;
    if (duration <= 0) {
      duration = (await this.extractDuration(audio)) ?? 0;
    }

    const status = dto.status ?? 'draft';
    let publishedAt: Date | null = null;
    let effectiveStatus: 'draft' | 'scheduled' | 'published' =
      status === 'published' ? 'published' : 'draft';

    if (status === 'published') {
      publishedAt = new Date();
      effectiveStatus = 'published';
    } else if (dto.publishedAt) {
      const parsed = new Date(dto.publishedAt);
      if (parsed > new Date()) {
        effectiveStatus = 'scheduled';
        publishedAt = parsed;
      } else {
        publishedAt = parsed;
        effectiveStatus = 'published';
      }
    }

    const doc = await this.episodeModel.create({
      podcastId: new Types.ObjectId(podcastId),
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      duration,
      seasonNumber: dto.seasonNumber ?? null,
      episodeNumber: dto.episodeNumber ?? null,
      showNotes: dto.showNotes?.trim() || null,
      audioUrl: uploadResult.url,
      audioFormat,
      coverUrl,
      transcription: dto.transcription?.trim() || null,
      chapterMarkers: dto.chapterMarkers ?? [],
      status: effectiveStatus,
      publishedAt,
    });

    if (effectiveStatus === 'published') {
      this.subscriptionsService
        .getSubscriberUserIdsByPodcast(podcastId)
        .then((userIds) =>
          this.notificationsService.notifyNewEpisode(
            userIds,
            doc._id.toString(),
            doc.title,
            podcast.title,
          ),
        )
        .catch((err) =>
          this.logger.warn(`Failed to notify new episode: ${err?.message}`),
        );
    }

    this.logger.log(
      `Episode created id=${doc._id} podcastId=${podcastId} title=${dto.title} status=${effectiveStatus}`,
    );
    return doc;
  }

  async findAllByPodcast(
    podcastId: string,
    options?: { status?: string; limit?: number; offset?: number },
  ): Promise<{ items: EpisodeDocument[]; total: number }> {
    const filter: Record<string, unknown> = {
      podcastId: new Types.ObjectId(podcastId),
    };
    if (
      options?.status &&
      ['draft', 'scheduled', 'published', 'archived'].includes(options.status)
    ) {
      filter.status = options.status;
    }

    const [items, total] = await Promise.all([
      this.episodeModel
        .find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(options?.offset ?? 0)
        .limit(Math.min(options?.limit ?? 20, 100))
        .exec(),
      this.episodeModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async findById(id: string | Types.ObjectId): Promise<EpisodeDocument | null> {
    return this.episodeModel.findById(id).populate('podcastId').exec();
  }

  async findByIds(ids: Types.ObjectId[]): Promise<EpisodeDocument[]> {
    if (ids.length === 0) return [];
    return this.episodeModel
      .find({ _id: { $in: ids } })
      .populate('podcastId')
      .exec();
  }

  async findByIdOrThrow(id: string | Types.ObjectId): Promise<EpisodeDocument> {
    const doc = await this.findById(id);
    if (!doc) {
      throw new NotFoundException('Episode not found');
    }
    return doc;
  }

  async update(
    id: string | Types.ObjectId,
    ownerId: Types.ObjectId,
    input: UpdateEpisodeInput,
  ): Promise<EpisodeDocument> {
    const doc = await this.findByIdOrThrow(id);
    const podcastIdRef =
      typeof doc.podcastId === 'object' &&
      doc.podcastId &&
      '_id' in doc.podcastId
        ? (doc.podcastId as { _id: Types.ObjectId })._id
        : doc.podcastId;
    const podcast = await this.podcastsService.findByIdOrThrow(podcastIdRef);
    if (!podcast.ownerId.equals(ownerId)) {
      throw new ForbiddenException('Not the owner of this episode');
    }

    const { dto, cover } = input;
    const updates: Record<string, unknown> = {};

    if (dto.title !== undefined) updates.title = dto.title.trim();
    if (dto.description !== undefined)
      updates.description = dto.description?.trim() || null;
    if (dto.seasonNumber !== undefined) updates.seasonNumber = dto.seasonNumber;
    if (dto.episodeNumber !== undefined)
      updates.episodeNumber = dto.episodeNumber;
    if (dto.showNotes !== undefined)
      updates.showNotes = dto.showNotes?.trim() || null;
    if (dto.transcription !== undefined)
      updates.transcription = dto.transcription?.trim() || null;
    if (dto.chapterMarkers !== undefined)
      updates.chapterMarkers = dto.chapterMarkers;

    if (cover) {
      const coverResult = await this.coverUploadService.uploadCover(cover);
      if (coverResult) {
        updates.coverUrl = coverResult.url;
      }
    }

    if (dto.status !== undefined) {
      if (dto.status === 'archived') {
        updates.status = 'archived';
        updates.archivedAt = new Date();
      } else if (dto.status === 'scheduled' && dto.publishedAt) {
        updates.status = 'scheduled';
        updates.publishedAt = new Date(dto.publishedAt);
      } else if (dto.status === 'published') {
        updates.status = 'published';
        updates.publishedAt = dto.publishedAt
          ? new Date(dto.publishedAt)
          : new Date();
        updates.archivedAt = null;
      } else if (dto.status === 'draft') {
        updates.status = 'draft';
        updates.publishedAt = null;
        updates.archivedAt = null;
      }
    } else if (dto.publishedAt !== undefined) {
      const parsed = new Date(dto.publishedAt);
      if (parsed > new Date()) {
        updates.status = 'scheduled';
        updates.publishedAt = parsed;
      } else {
        updates.status = 'published';
        updates.publishedAt = parsed;
      }
    }

    const updated = await this.episodeModel
      .findByIdAndUpdate(id, { $set: updates }, { returnDocument: 'after' })
      .exec();

    if (!updated) {
      throw new NotFoundException('Episode not found');
    }

    if (doc.status !== 'published' && updated.status === 'published') {
      const podcastIdRef =
        typeof updated.podcastId === 'object' &&
        updated.podcastId &&
        '_id' in updated.podcastId
          ? (updated.podcastId as { _id: Types.ObjectId })._id
          : updated.podcastId;
      const podcastIdStr = podcastIdRef.toString();
      const pod = await this.podcastsService.findByIdOrThrow(podcastIdRef);
      this.subscriptionsService
        .getSubscriberUserIdsByPodcast(podcastIdStr)
        .then((userIds) =>
          this.notificationsService.notifyNewEpisode(
            userIds,
            updated._id.toString(),
            updated.title,
            pod.title,
          ),
        )
        .catch((err) =>
          this.logger.warn(`Failed to notify new episode: ${err?.message}`),
        );
    }

    this.logger.log(`Episode updated id=${id}`);
    return updated;
  }

  async delete(
    id: string | Types.ObjectId,
    ownerId: Types.ObjectId,
  ): Promise<void> {
    const doc = await this.findByIdOrThrow(id);
    const podcast = await this.podcastsService.findByIdOrThrow(doc.podcastId);
    if (!podcast.ownerId.equals(ownerId)) {
      throw new ForbiddenException('Not the owner of this episode');
    }

    await this.episodeModel.findByIdAndDelete(id).exec();
    this.logger.log(`Episode deleted id=${id}`);
  }

  async findPublishedByPodcast(
    podcastId: string | Types.ObjectId,
  ): Promise<EpisodeDocument[]> {
    return this.episodeModel
      .find({
        podcastId: new Types.ObjectId(podcastId),
        status: 'published',
      })
      .sort({ publishedAt: -1 })
      .exec();
  }

  async cancelScheduledByPodcast(
    podcastId: string | Types.ObjectId,
  ): Promise<number> {
    const result = await this.episodeModel
      .updateMany(
        {
          podcastId: new Types.ObjectId(podcastId),
          status: 'scheduled',
        },
        { $set: { status: 'draft', publishedAt: null } },
      )
      .exec();

    if (result.modifiedCount > 0) {
      this.logger.log(
        `Cancelled ${result.modifiedCount} scheduled episodes for podcast ${podcastId}`,
      );
    }
    return result.modifiedCount;
  }

  async publishScheduledEpisodes(dueBefore: Date): Promise<EpisodeDocument[]> {
    const episodes = await this.episodeModel
      .find({
        status: 'scheduled',
        publishedAt: { $lte: dueBefore },
      })
      .exec();

    const published: EpisodeDocument[] = [];
    for (const ep of episodes) {
      const updated = await this.episodeModel
        .findByIdAndUpdate(
          ep._id,
          {
            $set: {
              status: 'published',
              publishedAt: ep.publishedAt ?? new Date(),
            },
          },
          { returnDocument: 'after' },
        )
        .exec();
      if (updated) {
        published.push(updated);
        this.logger.log(`Episode published (scheduled) id=${ep._id}`);
      }
    }
    return published;
  }

  private async extractDuration(_audio: {
    buffer: Buffer;
    mimetype: string;
  }): Promise<number | null> {
    return null;
  }
}
