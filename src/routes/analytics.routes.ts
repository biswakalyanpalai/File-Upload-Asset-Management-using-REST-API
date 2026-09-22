import { Router } from 'express';
import { getStorageAnalytics } from '../controllers/analytics.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/storage', getStorageAnalytics);

export default router;
