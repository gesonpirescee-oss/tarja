import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

interface StorageConfig {
  type: 's3' | 'minio' | 'local';
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  bucket?: string;
  region?: string;
  useSSL?: boolean;
  localPath?: string;
}

class StorageService {
  private config: StorageConfig;
  private s3Client: S3Client | null = null;

  constructor() {
    this.config = {
      type: (process.env.STORAGE_TYPE as 's3' | 'minio' | 'local') || 'local',
      endpoint: process.env.STORAGE_ENDPOINT,
      accessKey: process.env.STORAGE_ACCESS_KEY,
      secretKey: process.env.STORAGE_SECRET_KEY,
      bucket: process.env.STORAGE_BUCKET || 'tarja-documents',
      region: process.env.STORAGE_REGION || 'us-east-1',
      useSSL: process.env.STORAGE_USE_SSL === 'true',
      localPath: process.env.STORAGE_LOCAL_PATH || 'uploads',
    };

    this.initialize();
  }

  private initialize() {
    if (this.config.type === 's3' || this.config.type === 'minio') {
      this.s3Client = new S3Client({
        endpoint: this.config.endpoint,
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKey || '',
          secretAccessKey: this.config.secretKey || '',
        },
        forcePathStyle: this.config.type === 'minio', // MinIO requer path-style
      });

      logger.info(`Storage initialized: ${this.config.type} (${this.config.endpoint})`);
    } else {
      // Criar diretório local se não existir
      if (this.config.localPath && !existsSync(this.config.localPath)) {
        mkdirSync(this.config.localPath, { recursive: true });
      }
      logger.info(`Storage initialized: local filesystem (${this.config.localPath})`);
    }
  }

  /**
   * Faz upload de um arquivo
   */
  async uploadFile(
    filePath: string,
    key: string,
    contentType?: string
  ): Promise<{ key: string; size: number; hash: string }> {
    try {
      const fileBuffer = readFileSync(filePath);
      const hash = createHash('sha256').update(fileBuffer).digest('hex');

      if (this.config.type === 's3' || this.config.type === 'minio') {
        if (!this.s3Client) {
          throw new Error('S3 client not initialized');
        }

        const command = new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType || 'application/octet-stream',
        });

        await this.s3Client.send(command);

        logger.info(`File uploaded to ${this.config.type}: ${key}`);
      } else {
        // Armazenamento local
        const localPath = join(this.config.localPath || 'uploads', key);
        const localDir = dirname(localPath);

        if (!existsSync(localDir)) {
          mkdirSync(localDir, { recursive: true });
        }

        writeFileSync(localPath, fileBuffer);
        logger.info(`File uploaded to local storage: ${localPath}`);
      }

      return {
        key,
        size: fileBuffer.length,
        hash,
      };
    } catch (error) {
      logger.error('Error uploading file', error);
      throw error;
    }
  }

  /**
   * Obtém uma URL pré-assinada para download (válida por tempo limitado)
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (this.config.type === 's3' || this.config.type === 'minio') {
      if (!this.s3Client) {
        throw new Error('S3 client not initialized');
      }

      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } else {
      // Para storage local, retornar caminho relativo
      // Em produção, isso deveria ser servido via API
      return `/api/v1/storage/${key}`;
    }
  }

  /**
   * Obtém stream de leitura do arquivo (async para S3)
   */
  async getFileStream(key: string): Promise<NodeJS.ReadableStream> {
    if (this.config.type === 's3' || this.config.type === 'minio') {
      if (!this.s3Client) {
        throw new Error('S3 client not initialized');
      }

      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      // Obter resposta do S3
      const response = await this.s3Client.send(command);
      
      if (response.Body) {
        // Converter Body para stream Node.js
        if ('transformToByteArray' in response.Body) {
          const bytes = await (response.Body as any).transformToByteArray();
          const { Readable } = require('stream');
          return Readable.from(Buffer.from(bytes));
        }
        // Se já for um stream
        return response.Body as any;
      }
      
      throw new Error('Unable to get file stream from S3');
    } else {
      // Storage local
      const localPath = join(this.config.localPath || 'uploads', key);
      if (!existsSync(localPath)) {
        throw new Error(`File not found: ${localPath}`);
      }
      return createReadStream(localPath);
    }
  }

  /**
   * Obtém caminho local do arquivo (apenas para storage local)
   */
  getLocalPath(key: string): string | null {
    if (this.config.type === 'local') {
      const localPath = join(this.config.localPath || 'uploads', key);
      return existsSync(localPath) ? localPath : null;
    }
    return null;
  }

  /**
   * Deleta um arquivo
   */
  async deleteFile(key: string): Promise<void> {
    try {
      if (this.config.type === 's3' || this.config.type === 'minio') {
        if (!this.s3Client) {
          throw new Error('S3 client not initialized');
        }

        const command = new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        });

        await this.s3Client.send(command);
        logger.info(`File deleted from ${this.config.type}: ${key}`);
      } else {
        // Storage local
        const localPath = join(this.config.localPath || 'uploads', key);
        if (existsSync(localPath)) {
          unlinkSync(localPath);
          logger.info(`File deleted from local storage: ${localPath}`);
        }
      }
    } catch (error) {
      logger.error('Error deleting file', error);
      throw error;
    }
  }

  /**
   * Gera uma chave única para o arquivo
   */
  generateKey(organizationId: string, documentId: string, type: 'original' | 'redacted', extension: string): string {
    return `${organizationId}/${documentId}/${type}.${extension}`;
  }
}

// Singleton instance
export const storageService = new StorageService();
