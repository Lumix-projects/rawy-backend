import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export interface UploadResult {
  url: string;
  key: string;
}

@Injectable()
export class S3UploadService {
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get('AWS_REGION', 'us-east-1');
    this.bucket = this.configService.get('AWS_S3_BUCKET', '');
    this.client = this.bucket ? new S3Client({ region: this.region }) : null;
  }

  async uploadAvatar(
    file: { buffer: Buffer; mimetype: string; size: number },
    prefix = 'avatars',
  ): Promise<UploadResult | null> {
    if (!this.client || !this.bucket) {
      return null; // S3 not configured; caller may fallback
    }

    this.validateImage(file);

    const ext = this.getExtensionFromMime(file.mimetype);
    const key = `${prefix}/${randomUUID()}${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    return { url, key };
  }

  async deleteByKey(key: string): Promise<void> {
    if (!this.client || !this.bucket) return;
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  private validateImage(file: { mimetype: string; size: number }): void {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed: JPEG, PNG, WebP`,
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File too large. Maximum size: 5MB`);
    }
  }

  private getExtensionFromMime(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    return map[mimetype] ?? '.bin';
  }
}
