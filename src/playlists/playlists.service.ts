import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Playlist, PlaylistDocument } from './schemas/playlist.schema';
import { EpisodesService } from '../episodes/episodes.service';
import { EpisodeDocument } from '../episodes/schemas/episode.schema';

@Injectable()
export class PlaylistsService {
  constructor(
    @InjectModel(Playlist.name)
    private readonly playlistModel: Model<PlaylistDocument>,
    private readonly episodesService: EpisodesService,
  ) {}

  async create(
    userId: Types.ObjectId,
    name: string,
  ): Promise<PlaylistDocument> {
    const trimmed = name?.trim();
    if (!trimmed || trimmed.length === 0) {
      throw new BadRequestException('Name is required');
    }
    if (trimmed.length > 100) {
      throw new BadRequestException('Name must be at most 100 characters');
    }

    const doc = await this.playlistModel.create({
      userId,
      name: trimmed,
      episodeIds: [],
    });
    return doc;
  }

  async findAll(userId: Types.ObjectId): Promise<PlaylistDocument[]> {
    return this.playlistModel.find({ userId }).sort({ updatedAt: -1 }).exec();
  }

  async findById(
    id: string | Types.ObjectId,
    userId?: Types.ObjectId,
  ): Promise<PlaylistDocument | null> {
    const query: Record<string, unknown> = { _id: new Types.ObjectId(id) };
    if (userId) {
      query.userId = userId;
    }
    return this.playlistModel.findById(query).exec();
  }

  async findByIdOrThrow(
    id: string | Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<PlaylistDocument> {
    const doc = await this.findById(id, userId);
    if (!doc) {
      throw new NotFoundException('Playlist not found');
    }
    return doc;
  }

  async update(
    id: string | Types.ObjectId,
    userId: Types.ObjectId,
    updates: { name?: string; episodeIds?: string[] },
  ): Promise<PlaylistDocument> {
    await this.findByIdOrThrow(id, userId);
    const set: Record<string, unknown> = { updatedAt: new Date() };

    if (updates.name !== undefined) {
      const trimmed = updates.name?.trim();
      if (trimmed === '' || !trimmed) {
        throw new BadRequestException('Name cannot be empty');
      }
      if (trimmed.length > 100) {
        throw new BadRequestException('Name must be at most 100 characters');
      }
      set.name = trimmed;
    }

    if (updates.episodeIds !== undefined) {
      if (!Array.isArray(updates.episodeIds)) {
        throw new BadRequestException('episodeIds must be an array');
      }
      set.episodeIds = updates.episodeIds.map((sid) => new Types.ObjectId(sid));
    }

    const updated = await this.playlistModel
      .findByIdAndUpdate(id, { $set: set }, { returnDocument: 'after' })
      .exec();

    if (!updated) {
      throw new NotFoundException('Playlist not found');
    }
    return updated;
  }

  async addEpisode(
    playlistId: string | Types.ObjectId,
    userId: Types.ObjectId,
    episodeId: string,
  ): Promise<PlaylistDocument> {
    const doc = await this.findByIdOrThrow(playlistId, userId);
    const episode = await this.episodesService.findById(episodeId);
    if (!episode) {
      throw new NotFoundException('Episode not found');
    }

    const epObjId = new Types.ObjectId(episodeId);
    if (doc.episodeIds.some((e) => e.equals(epObjId))) {
      return doc;
    }

    const updated = await this.playlistModel
      .findByIdAndUpdate(
        playlistId,
        {
          $push: { episodeIds: epObjId },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: 'after' },
      )
      .exec();

    return updated!;
  }

  async removeEpisode(
    playlistId: string | Types.ObjectId,
    userId: Types.ObjectId,
    episodeId: string,
  ): Promise<PlaylistDocument> {
    await this.findByIdOrThrow(playlistId, userId);

    const updated = await this.playlistModel
      .findByIdAndUpdate(
        playlistId,
        {
          $pull: { episodeIds: new Types.ObjectId(episodeId) },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Playlist not found');
    }
    return updated;
  }

  async reorderEpisodes(
    playlistId: string | Types.ObjectId,
    userId: Types.ObjectId,
    episodeIds: string[],
  ): Promise<PlaylistDocument> {
    await this.findByIdOrThrow(playlistId, userId);
    const newIds = episodeIds.map((id) => new Types.ObjectId(id));
    const updated = await this.playlistModel
      .findByIdAndUpdate(
        playlistId,
        {
          $set: {
            episodeIds: newIds,
            updatedAt: new Date(),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();

    return updated!;
  }

  async delete(
    id: string | Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<void> {
    const doc = await this.findById(id, userId);
    if (!doc) {
      throw new NotFoundException('Playlist not found');
    }
    await this.playlistModel.findByIdAndDelete(id).exec();
  }

  async getEpisodesForPlaylist(
    doc: PlaylistDocument,
  ): Promise<EpisodeDocument[]> {
    if (!doc.episodeIds?.length) return [];
    return this.episodesService.findByIds(doc.episodeIds);
  }
}
