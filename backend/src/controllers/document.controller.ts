import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { CustomError } from '../middleware/errorHandler';
import { prisma } from '../config/database';
import { createAuditLog } from '../utils/audit';
import { processDocument } from '../services/document.service';
import { redactDocument } from '../services/redaction.service';
import { storageService } from '../services/storage.service';
import { createHash } from 'crypto';
import { readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { createReadStream } from 'fs';
import path from 'path';

export const uploadDocument = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.file) {
      throw new CustomError('No file uploaded', 400);
    }

    const { purpose, legalBasis, retentionDays } = req.body;

    if (!purpose || !legalBasis || !retentionDays) {
      throw new CustomError('Purpose, legal basis, and retention days are required', 400);
    }

    // Calculate file hash
    const fileBuffer = readFileSync(req.file.path);
    const hash = createHash('sha256').update(fileBuffer).digest('hex');

    // Check if document already exists
    const existingDoc = await prisma.document.findUnique({
      where: { hash }
    });

    if (existingDoc) {
      // Delete uploaded file
      unlinkSync(req.file.path);
      throw new CustomError('Document already exists', 409);
    }

    // Upload para storage (S3/MinIO ou local)
    const fileExtension = path.extname(req.file.originalname).substring(1);
    const storageKey = storageService.generateKey(
      req.organizationId!,
      'temp', // Será atualizado após criar o documento
      'original',
      fileExtension
    );

    // Upload do arquivo
    const uploadResult = await storageService.uploadFile(
      req.file.path,
      storageKey,
      req.file.mimetype
    );

    // Criar documento temporário para obter ID
    const tempDoc = await prisma.document.create({
      data: {
        originalFileName: req.file.originalname,
        fileType: fileExtension,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        hash,
        purpose,
        legalBasis,
        retentionDays: parseInt(retentionDays),
        organizationId: req.organizationId!,
        uploadedById: req.userId!,
        originalPath: storageKey, // Armazenar a chave do storage
        status: 'UPLOADED'
      }
    });

    // Atualizar chave do storage com o ID real do documento
    const finalKey = storageService.generateKey(
      req.organizationId!,
      tempDoc.id,
      'original',
      fileExtension
    );

    // Se a chave mudou, fazer upload novamente (ou renomear)
    if (finalKey !== storageKey) {
      // Re-upload com chave final
      await storageService.uploadFile(req.file.path, finalKey, req.file.mimetype);
      // Deletar arquivo temporário
      await storageService.deleteFile(storageKey);
    }

    // Atualizar documento com chave final
    const document = await prisma.document.update({
      where: { id: tempDoc.id },
      data: { originalPath: finalKey }
    });

    // Limpar arquivo temporário local
    if (existsSync(req.file.path)) {
      unlinkSync(req.file.path);
    }

    // Audit log
    await createAuditLog({
      userId: req.userId,
      organizationId: req.organizationId,
      documentId: document.id,
      action: 'upload',
      resourceType: 'document',
      resourceId: document.id,
      details: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        purpose,
        legalBasis
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Queue processing job
    await processDocument(document.id);

    res.status(201).json({
      success: true,
      data: { document }
    });
  } catch (error) {
    next(error);
  }
};

export const getDocuments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page = '1', limit = '20', status } = req.query;

    const where: any = {
      organizationId: req.organizationId
    };

    if (status) {
      where.status = status;
    }

    const documents = await prisma.document.findMany({
      where,
      skip: (parseInt(page as string) - 1) * parseInt(limit as string),
      take: parseInt(limit as string),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalFileName: true,
        fileType: true,
        fileSize: true,
        status: true,
        createdAt: true,
        processedAt: true,
        redactedAt: true
      }
    });

    const total = await prisma.document.count({ where });

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getDocument = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findFirst({
      where: {
        id,
        organizationId: req.organizationId
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!document) {
      throw new CustomError('Document not found', 404);
    }

    res.json({
      success: true,
      data: { document }
    });
  } catch (error) {
    next(error);
  }
};

export const getDocumentDetections = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findFirst({
      where: {
        id,
        organizationId: req.organizationId
      }
    });

    if (!document) {
      throw new CustomError('Document not found', 404);
    }

    const detections = await prisma.detection.findMany({
      where: { documentId: id },
      include: {
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      data: { detections }
    });
  } catch (error) {
    next(error);
  }
};

export const updateDetection = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id, detectionId } = req.params;
    const { action, comment } = req.body;

    if (!['APPROVED', 'REJECTED', 'MODIFIED'].includes(action)) {
      throw new CustomError('Invalid action', 400);
    }

    const document = await prisma.document.findFirst({
      where: {
        id,
        organizationId: req.organizationId
      }
    });

    if (!document) {
      throw new CustomError('Document not found', 404);
    }

    const detection = await prisma.detection.findUnique({
      where: { id: detectionId }
    });

    if (!detection || detection.documentId !== id) {
      throw new CustomError('Detection not found', 404);
    }

    // Update detection
    const updatedDetection = await prisma.detection.update({
      where: { id: detectionId },
      data: {
        isApproved: action === 'APPROVED',
        isRejected: action === 'REJECTED',
        reviewedAt: new Date()
      }
    });

    // Create review record
    await prisma.detectionReview.create({
      data: {
        detectionId,
        userId: req.userId!,
        action: action as any,
        comment
      }
    });

    // Audit log
    await createAuditLog({
      userId: req.userId,
      organizationId: req.organizationId,
      documentId: id,
      action: 'review_detection',
      resourceType: 'detection',
      resourceId: detectionId,
      details: { action, comment },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      data: { detection: updatedDetection }
    });
  } catch (error) {
    next(error);
  }
};

export const applyRedaction = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findFirst({
      where: {
        id,
        organizationId: req.organizationId
      },
      include: {
        detections: {
          where: {
            isApproved: true,
            isRejected: false
          }
        }
      }
    });

    if (!document) {
      throw new CustomError('Document not found', 404);
    }

    if (document.status !== 'REVIEW_READY' && document.status !== 'DETECTION_COMPLETE') {
      throw new CustomError('Document not ready for redaction', 400);
    }

    if (!document.originalPath) {
      throw new CustomError('Original file not found', 404);
    }

    // Obter arquivo original do storage para processamento
    const tempOriginalPath = path.join('uploads', 'temp', `temp_${document.id}_${Date.now()}.${document.fileType}`);
    const tempDir = dirname(tempOriginalPath);
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    // Download do storage para arquivo temporário
    const fileStream = storageService.getFileStream(document.originalPath);
    const writeStream = require('fs').createWriteStream(tempOriginalPath);
    await new Promise((resolve, reject) => {
      fileStream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Preparar diretório de saída
    const outputDir = path.join('uploads', 'redacted', document.organizationId || 'default');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Aplicar tarja
    const redactionResult = await redactDocument(
      tempOriginalPath,
      document.mimeType,
      document.detections,
      outputDir,
      document.id
    );

    // Upload do arquivo tarjado para storage
    const redactedKey = storageService.generateKey(
      document.organizationId,
      document.id,
      'redacted',
      document.fileType
    );

    await storageService.uploadFile(
      redactionResult.outputPath,
      redactedKey,
      document.mimeType
    );

    // Limpar arquivos temporários
    if (existsSync(tempOriginalPath)) {
      unlinkSync(tempOriginalPath);
    }
    if (existsSync(redactionResult.outputPath)) {
      unlinkSync(redactionResult.outputPath);
    }

    // Criar versão do documento tarjado
    await prisma.documentVersion.create({
      data: {
        documentId: id,
        version: 1,
        type: 'redacted',
        filePath: redactionResult.outputPath,
        hash: redactionResult.hash
      }
    });

    // Update document status e caminho do arquivo tarjado (chave do storage)
    const updatedDocument = await prisma.document.update({
      where: { id },
      data: {
        status: 'REDACTED',
        redactedAt: new Date(),
        redactedPath: redactedKey
      }
    });

    // Audit log
    await createAuditLog({
      userId: req.userId,
      organizationId: req.organizationId,
      documentId: id,
      action: 'apply_redaction',
      resourceType: 'document',
      resourceId: id,
      details: {
        detectionsCount: document.detections.length
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      data: { document: updatedDocument }
    });
  } catch (error) {
    next(error);
  }
};

export const downloadDocument = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { type = 'redacted' } = req.query;

    const document = await prisma.document.findFirst({
      where: {
        id,
        organizationId: req.organizationId
      }
    });

    if (!document) {
      throw new CustomError('Document not found', 404);
    }

    // Check permissions based on type
    if (type === 'original' && req.userRole !== 'ADMIN' && req.userRole !== 'SUPER_ADMIN') {
      throw new CustomError('Insufficient permissions to download original', 403);
    }

    const filePath = type === 'original' ? document.originalPath : document.redactedPath;

    if (!filePath || !require('fs').existsSync(filePath)) {
      throw new CustomError('File not found', 404);
    }

    // Audit log
    await createAuditLog({
      userId: req.userId,
      organizationId: req.organizationId,
      documentId: id,
      action: 'download',
      resourceType: 'document',
      resourceId: id,
      details: { type },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.download(filePath, document.originalFileName);
  } catch (error) {
    next(error);
  }
};

export const viewDocument = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findFirst({
      where: {
        id,
        organizationId: req.organizationId
      }
    });

    if (!document) {
      throw new CustomError('Document not found', 404);
    }

    // Para visualização, sempre usar o original (não tarjado)
    const storageKey = document.originalPath;

    if (!storageKey) {
      throw new CustomError('File not found', 404);
    }

    // Determinar content type
    const contentType = document.mimeType || 'application/pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${document.originalFileName}"`);

    // Obter stream do arquivo do storage
    const fileStream = storageService.getFileStream(storageKey);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
};
