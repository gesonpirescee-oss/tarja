import { prisma } from '../config/database';

interface CreateAuditLogParams {
  userId?: string;
  organizationId?: string;
  documentId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

export const createAuditLog = async (params: CreateAuditLogParams) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        organizationId: params.organizationId,
        documentId: params.documentId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        details: params.details || {},
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
      }
    });
  } catch (error) {
    // Log error but don't throw - audit logging should not break the main flow
    console.error('Failed to create audit log:', error);
  }
};
