import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { allAsync, getAsync, runAsync } from '../db/database';
import { AuthRequest } from '../middleware/auth';

function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

export async function uploadFile(req: AuthRequest, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user!.id;
    const folderId = (req.body.folder_id as string) || null;
    const uploadedFile = req.file;

    // Check user quota limit
    const user = await getAsync('SELECT storage_used, storage_limit FROM users WHERE id = ?', [userId]);
    if (!user) {
      fs.unlinkSync(uploadedFile.path);
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.storage_used + uploadedFile.size > user.storage_limit) {
      fs.unlinkSync(uploadedFile.path);
      return res.status(413).json({
        error: 'Storage quota exceeded',
        storage_used_bytes: user.storage_used,
        storage_limit_bytes: user.storage_limit,
        attempted_file_size: uploadedFile.size,
      });
    }

    // Verify folder exists if specified
    if (folderId) {
      const folder = await getAsync('SELECT id FROM folders WHERE id = ? AND user_id = ?', [folderId, userId]);
      if (!folder) {
        fs.unlinkSync(uploadedFile.path);
        return res.status(404).json({ error: 'Target folder not found' });
      }
    }

    const fileHash = await calculateFileHash(uploadedFile.path);
    const fileId = uuidv4();
    const now = new Date().toISOString();

    await runAsync(
      `INSERT INTO files (id, user_id, folder_id, name, original_name, mime_type, size, hash, storage_path, is_trashed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        fileId,
        userId,
        folderId,
        uploadedFile.originalname,
        uploadedFile.originalname,
        uploadedFile.mimetype,
        uploadedFile.size,
        fileHash,
        uploadedFile.path,
        now,
        now,
      ]
    );

    // Update user used storage
    await runAsync('UPDATE users SET storage_used = storage_used + ? WHERE id = ?', [uploadedFile.size, userId]);

    return res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        id: fileId,
        name: uploadedFile.originalname,
        mime_type: uploadedFile.mimetype,
        size: uploadedFile.size,
        hash: fileHash,
        folder_id: folderId,
        created_at: now,
      },
    });
  } catch (error: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function listFiles(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const isTrashed = req.query.trashed === 'true' ? 1 : 0;
    const search = req.query.search as string;

    let query = 'SELECT id, folder_id, name, original_name, mime_type, size, hash, is_trashed, created_at, updated_at FROM files WHERE user_id = ? AND is_trashed = ?';
    const params: any[] = [userId, isTrashed];

    if (search) {
      query += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const files = await allAsync(query, params);
    return res.json({ files });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function downloadFile(req: AuthRequest, res: Response) {
  try {
    const fileId = req.params.id;
    const userId = req.user!.id;

    const file = await getAsync('SELECT * FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    if (!file || file.is_trashed) {
      return res.status(404).json({ error: 'File not found or trashed' });
    }

    if (!fs.existsSync(file.storage_path)) {
      return res.status(404).json({ error: 'Physical file missing from storage' });
    }

    return res.download(file.storage_path, file.original_name);
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function previewFile(req: AuthRequest, res: Response) {
  try {
    const fileId = req.params.id;
    const userId = req.user!.id;

    const file = await getAsync('SELECT * FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    if (!file || file.is_trashed) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (!fs.existsSync(file.storage_path)) {
      return res.status(404).json({ error: 'Physical file missing from storage' });
    }

    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${file.original_name}"`);
    return fs.createReadStream(file.storage_path).pipe(res);
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function renameFile(req: AuthRequest, res: Response) {
  try {
    const fileId = req.params.id;
    const userId = req.user!.id;
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'New file name is required' });
    }

    const file = await getAsync('SELECT id FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const now = new Date().toISOString();
    await runAsync('UPDATE files SET name = ?, updated_at = ? WHERE id = ?', [name, now, fileId]);

    return res.json({ message: 'File renamed successfully', file_id: fileId, name });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function moveFile(req: AuthRequest, res: Response) {
  try {
    const fileId = req.params.id;
    const userId = req.user!.id;
    const folderId = req.body.folder_id === null ? null : req.body.folder_id;

    const file = await getAsync('SELECT id FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (folderId) {
      const folder = await getAsync('SELECT id FROM folders WHERE id = ? AND user_id = ?', [folderId, userId]);
      if (!folder) {
        return res.status(404).json({ error: 'Target folder not found' });
      }
    }

    const now = new Date().toISOString();
    await runAsync('UPDATE files SET folder_id = ?, updated_at = ? WHERE id = ?', [folderId, now, fileId]);

    return res.json({ message: 'File moved successfully', file_id: fileId, target_folder_id: folderId });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function softDeleteFile(req: AuthRequest, res: Response) {
  try {
    const fileId = req.params.id;
    const userId = req.user!.id;

    const file = await getAsync('SELECT id FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const now = new Date().toISOString();
    await runAsync('UPDATE files SET is_trashed = 1, updated_at = ? WHERE id = ?', [now, fileId]);

    return res.json({ message: 'File moved to trash', file_id: fileId });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function restoreFile(req: AuthRequest, res: Response) {
  try {
    const fileId = req.params.id;
    const userId = req.user!.id;

    const file = await getAsync('SELECT id FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const now = new Date().toISOString();
    await runAsync('UPDATE files SET is_trashed = 0, updated_at = ? WHERE id = ?', [now, fileId]);

    return res.json({ message: 'File restored from trash', file_id: fileId });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function permanentDeleteFile(req: AuthRequest, res: Response) {
  try {
    const fileId = req.params.id;
    const userId = req.user!.id;

    const file = await getAsync('SELECT * FROM files WHERE id = ? AND user_id = ?', [fileId, userId]);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete physical file
    if (fs.existsSync(file.storage_path)) {
      fs.unlinkSync(file.storage_path);
    }

    await runAsync('DELETE FROM files WHERE id = ?', [fileId]);

    // Reclaim storage quota
    await runAsync('UPDATE users SET storage_used = MAX(0, storage_used - ?) WHERE id = ?', [file.size, userId]);

    return res.json({ message: 'File permanently deleted', file_id: fileId, reclaimed_bytes: file.size });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function createShareLink(req: AuthRequest, res: Response) {
  try {
    const fileId = req.params.id;
    const userId = req.user!.id;
    const { expires_in_hours } = req.body;

    const file = await getAsync('SELECT id FROM files WHERE id = ? AND user_id = ? AND is_trashed = 0', [fileId, userId]);
    if (!file) {
      return res.status(404).json({ error: 'Active file not found' });
    }

    const shareToken = crypto.randomBytes(24).toString('hex');
    const shareId = uuidv4();
    const createdAt = new Date().toISOString();
    let expiresAt: string | null = null;

    if (expires_in_hours && typeof expires_in_hours === 'number') {
      const date = new Date();
      date.setHours(date.getHours() + expires_in_hours);
      expiresAt = date.toISOString();
    }

    await runAsync(
      `INSERT INTO file_shares (id, file_id, share_token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [shareId, fileId, shareToken, expiresAt, createdAt]
    );

    return res.status(201).json({
      message: 'Share link generated',
      share_token: shareToken,
      public_download_url: `/api/v1/public/share/${shareToken}`,
      expires_at: expiresAt,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function getSharedFile(req: any, res: Response) {
  try {
    const shareToken = req.params.token;

    const share = await getAsync('SELECT * FROM file_shares WHERE share_token = ?', [shareToken]);
    if (!share) {
      return res.status(404).json({ error: 'Shared link not found or invalid' });
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Shared link has expired' });
    }

    const file = await getAsync('SELECT * FROM files WHERE id = ? AND is_trashed = 0', [share.file_id]);
    if (!file || !fs.existsSync(file.storage_path)) {
      return res.status(404).json({ error: 'Shared file is no longer available' });
    }

    return res.download(file.storage_path, file.original_name);
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
