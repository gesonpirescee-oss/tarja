import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getAuditLogs, getComplianceReport } from '../controllers/audit.controller';

export const auditRoutes = Router();

auditRoutes.use(authenticate);

// Only auditors and admins can access audit logs
auditRoutes.get('/logs', authorize('AUDITOR', 'ADMIN', 'SUPER_ADMIN'), getAuditLogs);
auditRoutes.get('/compliance', authorize('AUDITOR', 'ADMIN', 'SUPER_ADMIN'), getComplianceReport);
