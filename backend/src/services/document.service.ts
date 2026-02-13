import { Queue } from 'bullmq';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// Initialize Redis connection for queues
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined
};

export const processingQueue = new Queue('document-processing', {
  connection: redisConfig
});

export const processDocument = async (documentId: string) => {
  try {
    // Update document status
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'PROCESSING' }
    });

    // Create processing job
    const job = await prisma.processingJob.create({
      data: {
        documentId,
        jobType: 'ocr',
        status: 'pending'
      }
    });

    // Add to queue
    await processingQueue.add('process-document', {
      documentId,
      jobId: job.id
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });

    logger.info(`Document ${documentId} queued for processing`);
  } catch (error) {
    logger.error('Error queueing document for processing', error);
    throw error;
  }
};
