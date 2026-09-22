import { Router } from 'express';
import { createFolder, deleteFolder, getFolderContents, listFolders, renameFolder } from '../controllers/folder.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', createFolder);
router.get('/', listFolders);
router.get('/:id/contents', getFolderContents);
router.patch('/:id/rename', renameFolder);
router.delete('/:id', deleteFolder);

export default router;
