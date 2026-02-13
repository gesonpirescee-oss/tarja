import { Worker } from 'bullmq';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { extractText } from '../services/ocr.service';
import { detectSensitiveData } from '../services/detection.service';
import { DetectionType, DetectionRiskLevel } from '@prisma/client';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined
};

const worker = new Worker(
  'document-processing',
  async (job) => {
    const { documentId, jobId } = job.data;

    logger.info(`Processing document ${documentId}`);

    try {
      // Update job status
      await prisma.processingJob.update({
        where: { id: jobId },
        data: {
          status: 'processing',
          startedAt: new Date(),
          progress: 10
        }
      });

      // Get document
      const document = await prisma.document.findUnique({
        where: { id: documentId }
      });

      if (!document || !document.originalPath) {
        throw new Error('Document not found or path missing');
      }

      // Extract text
      logger.info(`Extracting text from ${document.originalPath}`);
      const extractedText = await extractText(document.originalPath, document.mimeType);

      await prisma.processingJob.update({
        where: { id: jobId },
        data: { progress: 50 }
      });

      // Detect sensitive data
      logger.info('Detecting sensitive data');
      const detections = detectSensitiveData(extractedText.text);

      // Save detections to database
      for (const detection of detections) {
        await prisma.detection.create({
          data: {
            documentId,
            type: detection.type as DetectionType,
            riskLevel: detection.riskLevel as DetectionRiskLevel,
            confidence: detection.confidence,
            text: detection.text,
            startIndex: detection.startIndex,
            endIndex: detection.endIndex,
            pageNumber: detection.boundingBox ? 1 : null,
            boundingBox: detection.boundingBox || undefined
          }
        });
      }

      await prisma.processingJob.update({
        where: { id: jobId },
        data: { progress: 90 }
      });

      // Update document status
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'DETECTION_COMPLETE',
          processedAt: new Date()
        }
      });

      // Complete job
      await prisma.processingJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          progress: 100,
          metadata: {
            detectionsCount: detections.length,
            textLength: extractedText.text.length
          }
        }
      });

      logger.info(`Document ${documentId} processed successfully with ${detections.length} detections`);

      return {
        success: true,
        detectionsCount: detections.length
      };
    } catch (error: any) {
      logger.error(`Error processing document ${documentId}`, error);

      // Update job with error
      await prisma.processingJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: error.message,
          completedAt: new Date()
        }
      });

      // Update document status
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'UPLOADED' // Revert to uploaded for retry
        }
      });

      throw error;
    }
  },
  {
    connection: redisConfig,
    concurrency: 2 // Process 2 documents at a time
  }
);

worker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed:`, err);
});

logger.info('Worker started and listening for jobs');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down worker');
  await worker.close();
  process.exit(0);
});
