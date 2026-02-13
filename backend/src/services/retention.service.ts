import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { storageService } from './storage.service';

/**
 * Executa expurgo de documentos conforme políticas de retenção
 */
export const executeRetentionPolicies = async () => {
  try {
    logger.info('Starting retention policy execution');

    // Buscar todas as organizações ativas
    const organizations = await prisma.organization.findMany({
      where: { isActive: true },
      include: {
        policies: {
          where: { isActive: true }
        }
      }
    });

    let totalExpired = 0;
    let totalDeleted = 0;

    for (const org of organizations) {
      // Se organização tem políticas customizadas, usar elas
      // Senão, usar política padrão (30 dias)
      const defaultRetentionDays = 30;

      for (const policy of org.policies) {
        const retentionDays = policy.retentionDays || defaultRetentionDays;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        // Buscar documentos elegíveis para expurgo
        const documentsToExpire = await prisma.document.findMany({
          where: {
            organizationId: org.id,
            createdAt: {
              lte: cutoffDate
            },
            status: {
              not: 'DELETED'
            },
            // Aplicar filtro por tipo se especificado na política
            ...(policy.documentType ? { fileType: policy.documentType } : {})
          }
        });

        totalExpired += documentsToExpire.length;

        // Verificar se há bloqueios de exclusão (ex: processos judiciais)
        for (const doc of documentsToExpire) {
          try {
            // Verificar se documento tem bloqueio
            // (pode ser implementado como campo adicional no futuro)
            
            // Deletar arquivos do storage
            if (doc.originalPath) {
              await storageService.deleteFile(doc.originalPath);
            }
            if (doc.redactedPath) {
              await storageService.deleteFile(doc.redactedPath);
            }

            // Deletar versões do documento
            await prisma.documentVersion.deleteMany({
              where: { documentId: doc.id }
            });

            // Deletar detecções
            await prisma.detection.deleteMany({
              where: { documentId: doc.id }
            });

            // Deletar jobs de processamento
            await prisma.processingJob.deleteMany({
              where: { documentId: doc.id }
            });

            // Marcar documento como deletado
            await prisma.document.update({
              where: { id: doc.id },
              data: {
                status: 'DELETED'
              }
            });

            // Registrar na auditoria
            await prisma.auditLog.create({
              data: {
                organizationId: org.id,
                documentId: doc.id,
                action: 'document_expired',
                resourceType: 'document',
                resourceId: doc.id,
                details: {
                  policyId: policy.id,
                  retentionDays,
                  originalFileName: doc.originalFileName
                }
              }
            });

            totalDeleted++;
          } catch (error) {
            logger.error(`Error expiring document ${doc.id}`, error);
          }
        }
      }

      // Processar documentos sem política específica (usar padrão)
      if (org.policies.length === 0) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - defaultRetentionDays);

        const documentsToExpire = await prisma.document.findMany({
          where: {
            organizationId: org.id,
            createdAt: {
              lte: cutoffDate
            },
            status: {
              not: 'DELETED'
            }
          }
        });

        for (const doc of documentsToExpire) {
          try {
            if (doc.originalPath) {
              await storageService.deleteFile(doc.originalPath);
            }
            if (doc.redactedPath) {
              await storageService.deleteFile(doc.redactedPath);
            }

            await prisma.documentVersion.deleteMany({
              where: { documentId: doc.id }
            });

            await prisma.detection.deleteMany({
              where: { documentId: doc.id }
            });

            await prisma.processingJob.deleteMany({
              where: { documentId: doc.id }
            });

            await prisma.document.update({
              where: { id: doc.id },
              data: { status: 'DELETED' }
            });

            await prisma.auditLog.create({
              data: {
                organizationId: org.id,
                documentId: doc.id,
                action: 'document_expired',
                resourceType: 'document',
                resourceId: doc.id,
                details: {
                  retentionDays: defaultRetentionDays,
                  originalFileName: doc.originalFileName
                }
              }
            });

            totalDeleted++;
          } catch (error) {
            logger.error(`Error expiring document ${doc.id}`, error);
          }
        }
      }
    }

    logger.info(`Retention policy execution completed: ${totalExpired} expired, ${totalDeleted} deleted`);
    
    return {
      expired: totalExpired,
      deleted: totalDeleted
    };
  } catch (error) {
    logger.error('Error executing retention policies', error);
    throw error;
  }
};

/**
 * Envia notificações para documentos que serão expurgados em breve
 */
export const sendExpirationNotifications = async (daysBefore: number = 7) => {
  try {
    logger.info(`Sending expiration notifications for documents expiring in ${daysBefore} days`);

    const organizations = await prisma.organization.findMany({
      where: { isActive: true },
      include: {
        policies: {
          where: { isActive: true }
        }
      }
    });

    const notificationDate = new Date();
    notificationDate.setDate(notificationDate.getDate() + daysBefore);

    for (const org of organizations) {
      const defaultRetentionDays = 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - (defaultRetentionDays - daysBefore));

      for (const policy of org.policies) {
        const retentionDays = policy.retentionDays || defaultRetentionDays;
        const policyCutoffDate = new Date();
        policyCutoffDate.setDate(policyCutoffDate.getDate() - (retentionDays - daysBefore));

        const documentsToNotify = await prisma.document.findMany({
          where: {
            organizationId: org.id,
            createdAt: {
              lte: policyCutoffDate,
              gte: new Date(policyCutoffDate.getTime() - 24 * 60 * 60 * 1000) // Últimas 24h
            },
            status: {
              not: 'DELETED'
            },
            ...(policy.documentType ? { fileType: policy.documentType } : {})
          },
          include: {
            uploadedBy: {
              select: {
                email: true,
                name: true
              }
            }
          }
        });

        // TODO: Implementar envio de email/notificação
        // Por enquanto, apenas logar
        for (const doc of documentsToNotify) {
          logger.info(`Document ${doc.id} will expire in ${daysBefore} days`, {
            documentId: doc.id,
            fileName: doc.originalFileName,
            userEmail: doc.uploadedBy.email,
            expirationDate: new Date(doc.createdAt.getTime() + retentionDays * 24 * 60 * 60 * 1000)
          });
        }
      }
    }
  } catch (error) {
    logger.error('Error sending expiration notifications', error);
    throw error;
  }
};
