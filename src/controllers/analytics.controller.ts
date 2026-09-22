import { Response } from 'express';
import { allAsync, getAsync } from '../db/database';
import { AuthRequest } from '../middleware/auth';

export async function getStorageAnalytics(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;

    const user = await getAsync('SELECT storage_used, storage_limit FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const mimeStats = await allAsync(
      `SELECT mime_type, COUNT(*) as file_count, SUM(size) as total_size_bytes
       FROM files
       WHERE user_id = ? AND is_trashed = 0
       GROUP BY mime_type
       ORDER BY total_size_bytes DESC`,
      [userId]
    );

    const trashedStats = await getAsync(
      `SELECT COUNT(*) as trashed_file_count, SUM(size) as trashed_size_bytes
       FROM files
       WHERE user_id = ? AND is_trashed = 1`,
      [userId]
    );

    const totalActiveFiles = await getAsync(
      `SELECT COUNT(*) as active_file_count FROM files WHERE user_id = ? AND is_trashed = 0`,
      [userId]
    );

    const totalFolders = await getAsync(
      `SELECT COUNT(*) as folder_count FROM folders WHERE user_id = ?`,
      [userId]
    );

    return res.json({
      storage: {
        used_bytes: user.storage_used,
        limit_bytes: user.storage_limit,
        used_mb: (user.storage_used / (1024 * 1024)).toFixed(2),
        limit_mb: (user.storage_limit / (1024 * 1024)).toFixed(2),
        percentage_used: ((user.storage_used / user.storage_limit) * 100).toFixed(2) + '%',
      },
      counts: {
        active_files: totalActiveFiles?.active_file_count || 0,
        folders: totalFolders?.folder_count || 0,
        trashed_files: trashedStats?.trashed_file_count || 0,
        trashed_size_bytes: trashedStats?.trashed_size_bytes || 0,
      },
      breakdown_by_mime: mimeStats,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
