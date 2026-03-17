import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { Readable } from 'stream';

const s3Client = new S3Client({
  region: config.S3_REGION,
  endpoint: config.S3_ENDPOINT,
  forcePathStyle: true, // Required for MinIO
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
});

/**
 * S3 storage service abstracted for MinIO (dev) and AWS S3 (prod).
 */
export class S3Service {
  private static bucket = config.S3_BUCKET;

  /**
   * Upload a file to S3.
   */
  static async upload(
    key: string,
    body: Buffer | Readable,
    contentType: string,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await s3Client.send(command);
    logger.info({ key, contentType }, 'S3 upload complete');

    return key;
  }

  /**
   * Generate a pre-signed URL for downloading.
   */
  static async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * Generate a pre-signed URL for uploading.
   */
  static async getUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * Delete a file from S3.
   */
  static async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await s3Client.send(command);
    logger.info({ key }, 'S3 delete complete');
  }

  /**
   * Check if a file exists in S3.
   */
  static async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Download a file from S3.
   */
  static async download(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await s3Client.send(command);
    const stream = response.Body as Readable;

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  /**
   * Build S3 key for tenant avatar files.
   */
  static avatarKey(tenantId: string, avatarId: string, filename: string): string {
    return `tenants/${tenantId}/avatars/${avatarId}/${filename}`;
  }

  /**
   * Build S3 key for tenant document files.
   */
  static documentKey(tenantId: string, personaId: string, docId: string, filename: string): string {
    return `tenants/${tenantId}/personas/${personaId}/documents/${docId}/${filename}`;
  }
}
