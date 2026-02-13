import multer from 'multer';
import { CustomError } from './errorHandler';
import crypto from 'crypto';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

// Create uploads directory if it doesn't exist
const uploadsDir = 'uploads/temp';
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new CustomError(`File type ${file.mimetype} not allowed`, 400));
  }
};

const maxSize = parseInt(process.env.MAX_FILE_SIZE || '52428800'); // 50MB default

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxSize
  }
});
