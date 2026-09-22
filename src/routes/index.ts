import { Router } from 'express';
import authRoutes from './auth.routes';
import folderRoutes from './folder.routes';
import fileRoutes from './file.routes';
import analyticsRoutes from './analytics.routes';
import publicRoutes from './public.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/folders', folderRoutes);
router.use('/files', fileRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/public', publicRoutes);

export default router;
