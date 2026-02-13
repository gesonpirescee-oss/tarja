import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { CustomError } from '../middleware/errorHandler';
import { prisma } from '../config/database';
import { createAuditLog } from '../utils/audit';
import { processDocument } from '../services/document.service';
import { createHash } from 'crypto';
import { readFileSync, unlinkSync } from 'fs';
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

    // Create document record
    const document = await prisma.document.create({
      data: {
        originalFileName: req.file.originalname,
        fileType: path.extname(req.file.originalname).substring(1),
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        hash,
        purpose,
        legalBasis,
        retentionDays: parseInt(retentionDays),
        organizationId: req.organizationId!,
        uploadedById: req.userId!,
        originalPath: req.file.path,
        status: 'UPLOADED'
      }
    });

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

    // TODO: Implement actual redaction logic
    // This will be implemented in the redaction service

    // Update document status
    const updatedDocument = await prisma.document.update({
      where: { id },
      data: {
        status: 'REDACTED',
        redactedAt: new Date()
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
