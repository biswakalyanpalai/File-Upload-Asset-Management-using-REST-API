import { Router } from 'express';
import {
  createShareLink,
  downloadFile,
  listFiles,
  moveFile,
  permanentDeleteFile,
  previewFile,
  renameFile,
  restoreFile,
  softDeleteFile,
  uploadFile,
} from '../controllers/file.controller';
import { authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';

const router = Router();

router.use(authenticate);

router.post('/upload', upload.single('file'), uploadFile);
router.get('/', listFiles);
router.get('/:id/download', downloadFile);
router.get('/:id/view', previewFile);
router.patch('/:id/rename', renameFile);
router.patch('/:id/move', moveFile);
router.post('/:id/trash', softDeleteFile);
router.post('/:id/restore', restoreFile);
router.delete('/:id', permanentDeleteFile);
router.post('/:id/share', createShareLink);

export default router;
