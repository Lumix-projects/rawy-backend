export class MediaItemDto {
  id: string;
  type: 'podcast' | 'episode' | 'playlist';
  title: string;
  subtitle?: string;
  imageUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  tags?: string[];
}

export class ContinueItemDto extends MediaItemDto {
  playbackPosition?: number; // seconds
}

export class HomeResponseDto {
  featured: MediaItemDto[];
  latest: MediaItemDto[];
  continueListening: ContinueItemDto[];
  recommendations: MediaItemDto[];
}
