import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

const ALLOWED_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export interface AudioUploadResult {
  url: string;
  key: string;
}

@Injectable()
export class AudioUploadService {
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get('AWS_REGION', 'us-east-1');
    this.bucket = this.configService.get('AWS_S3_BUCKET_AUDIO', '');
    this.client = this.bucket ? new S3Client({ region: this.region }) : null;
  }

  async uploadAudio(
    file: { buffer: Buffer; mimetype: string; size: number },
    prefix = 'episodes',
  ): Promise<AudioUploadResult | null> {
    if (!this.client || !this.bucket) {
      return null;
    }

    this.validateAudio(file);

    const ext = this.getExtensionFromMime(file.mimetype);
    const key = `${prefix}/${randomUUID()}${ext}`;

    const stream = Readable.from(file.buffer);

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        ContentType: file.mimetype,
      },
      queueSize: 4,
      partSize: 10 * 1024 * 1024, // 10MB parts
      leavePartsOnError: false,
    });

    await upload.done();

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    return { url, key };
  }

  /**
   * Extract S3 key from full URL or return as-is if already a key.
   */
  private urlOrKeyToKey(urlOrKey: string): string {
    try {
      if (urlOrKey.startsWith('http://') || urlOrKey.startsWith('https://')) {
        const u = new URL(urlOrKey);
        return u.pathname.replace(/^\//, '');
      }
      return urlOrKey;
    } catch {
      return urlOrKey;
    }
  }

  async getPresignedStreamUrl(urlOrKey: string, expiresInSeconds = 3600): Promise<string | null> {
    if (!this.client || !this.bucket) return null;
    const key = this.urlOrKeyToKey(urlOrKey);
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getPresignedDownloadUrl(urlOrKey: string, expiresInSeconds = 3600): Promise<string | null> {
    if (!this.client || !this.bucket) return null;
    const key = this.urlOrKeyToKey(urlOrKey);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: 'attachment',
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteByKey(key: string): Promise<void> {
    if (!this.client || !this.bucket) return;
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  private validateAudio(file: { mimetype: string; size: number }): void {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Allowed: MP3, WAV, M4A',
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        'File too large. Maximum size: 500MB',
      );
    }
  }

  private getExtensionFromMime(mimetype: string): string {
    const map: Record<string, string> = {
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/wav': '.wav',
      'audio/x-wav': '.wav',
      'audio/mp4': '.m4a',
      'audio/x-m4a': '.m4a',
    };
    return map[mimetype] ?? '.bin';
  }
}
