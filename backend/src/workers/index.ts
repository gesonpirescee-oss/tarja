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

      // Get file path from storage service
      const { storageService } = await import('../services/storage.service');
      logger.info(`Document originalPath: ${document.originalPath}`);
      logger.info(`Storage type: ${process.env.STORAGE_TYPE || 'local'}`);
      
      const filePath = storageService.getLocalPath(document.originalPath);
      logger.info(`Resolved file path: ${filePath}`);
      
      if (!filePath) {
        // Se não for storage local, precisamos baixar o arquivo primeiro
        if (process.env.STORAGE_TYPE !== 'local') {
          throw new Error('S3/MinIO storage not yet implemented for worker processing');
        }
        throw new Error(`File not found in storage: ${document.originalPath}`);
      }

      // Extract text
      logger.info(`Extracting text from ${filePath}`);
      const extractedText = await extractText(filePath, document.mimeType);
      logger.info(`Extracted text length: ${extractedText.text.length} characters`);

      await prisma.processingJob.update({
        where: { id: jobId },
        data: { progress: 50 }
      });

      // Detect sensitive data
      logger.info('Detecting sensitive data');
      const detections = detectSensitiveData(extractedText.text);
      logger.info(`Found ${detections.length} detections`);

      // Determinar página de cada detecção baseado no texto extraído
      const totalPages = extractedText.pages.length;
      const fullText = extractedText.text;
      
      // Calcular limites de cada página no texto completo
      const pageBoundaries: number[] = [0]; // Início do documento
      let currentPos = 0;
      
      for (let i = 0; i < extractedText.pages.length; i++) {
        const pageText = extractedText.pages[i].text;
        currentPos += pageText.length;
        pageBoundaries.push(currentPos);
      }
      
      // Garantir que o último boundary seja o fim do texto
      if (pageBoundaries[pageBoundaries.length - 1] < fullText.length) {
        pageBoundaries[pageBoundaries.length - 1] = fullText.length;
      }
      
      logger.info(`Calculated page boundaries for ${totalPages} pages: ${pageBoundaries.join(', ')}`);

      // Save detections to database
      const detectionsByPage: Map<number, number> = new Map(); // Contador por página
      
      for (const detection of detections) {
        // Determinar página baseado no startIndex
        let detectedPage = 1;
        for (let i = 0; i < pageBoundaries.length - 1; i++) {
          if (detection.startIndex >= pageBoundaries[i] && detection.startIndex < pageBoundaries[i + 1]) {
            detectedPage = i + 1;
            break;
          }
        }
        
        // Contar detecções por página
        detectionsByPage.set(detectedPage, (detectionsByPage.get(detectedPage) || 0) + 1);
        
        await prisma.detection.create({
          data: {
            documentId,
            type: detection.type as DetectionType,
            riskLevel: detection.riskLevel as DetectionRiskLevel,
            confidence: detection.confidence,
            text: detection.text,
            startIndex: detection.startIndex,
            endIndex: detection.endIndex,
            pageNumber: detectedPage,
            boundingBox: detection.boundingBox || undefined
          }
        });
      }
      
      // Log detecções por página
      logger.info('Detections by page:');
      detectionsByPage.forEach((count, page) => {
        logger.info(`  Page ${page}: ${count} detections`);
      });

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
