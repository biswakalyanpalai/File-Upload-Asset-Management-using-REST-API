import { Router } from 'express';
import { getSharedFile } from '../controllers/file.controller';

const router = Router();

router.get('/share/:token', getSharedFile);

export default router;
