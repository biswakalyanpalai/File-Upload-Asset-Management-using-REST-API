import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const isVercel = Boolean(process.env.VERCEL);

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret-key-12345',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  storageDir: isVercel
    ? path.join('/tmp', 'uploads')
    : path.resolve(process.env.STORAGE_DIR || './uploads'),
  defaultStorageLimitBytes: parseInt(process.env.DEFAULT_STORAGE_LIMIT_MB || '50', 10) * 1024 * 1024,
  dbPath: isVercel ? path.join('/tmp', 'storage.db') : path.resolve('./storage.db'),
};
