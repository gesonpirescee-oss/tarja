import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  uploadDocument,
  getDocuments,
  getDocument,
  getDocumentDetections,
  updateDetection,
  applyRedaction,
  downloadDocument
} from '../controllers/document.controller';
import { upload } from '../middleware/upload.middleware';

export const documentRoutes = Router();

// All document routes require authentication
documentRoutes.use(authenticate);

documentRoutes.post('/upload', upload.single('file'), uploadDocument);
documentRoutes.get('/', getDocuments);
documentRoutes.get('/:id', getDocument);
documentRoutes.get('/:id/detections', getDocumentDetections);
documentRoutes.put('/:id/detections/:detectionId', updateDetection);
documentRoutes.post('/:id/redact', applyRedaction);
documentRoutes.get('/:id/download', downloadDocument);
