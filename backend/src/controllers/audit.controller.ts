import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/database';

export const getAuditLogs = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      page = '1',
      limit = '50',
      userId,
      documentId,
      action,
      startDate,
      endDate
    } = req.query;

    const where: any = {};

    if (req.organizationId) {
      where.organizationId = req.organizationId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (documentId) {
      where.documentId = documentId;
    }

    if (action) {
      where.action = action;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate as string);
      }
    }

    const logs = await prisma.auditLog.findMany({
      where,
      skip: (parseInt(page as string) - 1) * parseInt(limit as string),
      take: parseInt(limit as string),
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    const total = await prisma.auditLog.count({ where });

    res.json({
      success: true,
      data: {
        logs,
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

export const getComplianceReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate } = req.query;

    const where: any = {};

    if (req.organizationId) {
      where.organizationId = req.organizationId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate as string);
      }
    }

    // Get statistics
    const totalDocuments = await prisma.document.count({ where });
    const totalProcessed = await prisma.document.count({
      where: {
        ...where,
        status: { in: ['REDACTED', 'ARCHIVED'] }
      }
    });

    const totalDetections = await prisma.detection.count({
      where: {
        document: where
      }
    });

    const totalApprovedDetections = await prisma.detection.count({
      where: {
        document: where,
        isApproved: true
      }
    });

    const actionsByType = await prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: true
    });

    res.json({
      success: true,
      data: {
        period: {
          startDate: startDate || null,
          endDate: endDate || null
        },
        statistics: {
          totalDocuments,
          totalProcessed,
          totalDetections,
          totalApprovedDetections,
          processingRate: totalDocuments > 0 ? (totalProcessed / totalDocuments) * 100 : 0
        },
        actionsByType: actionsByType.map(item => ({
          action: item.action,
          count: item._count
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};
