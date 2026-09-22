import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { allAsync, getAsync, runAsync } from '../db/database';
import { AuthRequest } from '../middleware/auth';

const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parent_id: z.string().nullable().optional(),
});

const updateFolderSchema = z.object({
  name: z.string().min(1).max(255),
});

export async function createFolder(req: AuthRequest, res: Response) {
  try {
    const parseResult = createFolderSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Validation error', details: parseResult.error.format() });
    }

    const { name, parent_id } = parseResult.data;
    const userId = req.user!.id;

    if (parent_id) {
      const parentFolder = await getAsync('SELECT id FROM folders WHERE id = ? AND user_id = ?', [parent_id, userId]);
      if (!parentFolder) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
    }

    const folderId = uuidv4();
    const createdAt = new Date().toISOString();

    await runAsync(
      `INSERT INTO folders (id, user_id, parent_id, name, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [folderId, userId, parent_id || null, name, createdAt]
    );

    return res.status(201).json({
      message: 'Folder created successfully',
      folder: { id: folderId, user_id: userId, parent_id: parent_id || null, name, created_at: createdAt },
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function listFolders(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const parentId = (req.query.parent_id as string) || null;

    let folders;
    if (parentId === 'root' || !parentId) {
      folders = await allAsync('SELECT * FROM folders WHERE user_id = ? AND parent_id IS NULL ORDER BY name ASC', [userId]);
    } else {
      folders = await allAsync('SELECT * FROM folders WHERE user_id = ? AND parent_id = ? ORDER BY name ASC', [userId, parentId]);
    }

    return res.json({ folders });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function getFolderContents(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const folderId = req.params.id;

    let currentFolder = null;

    if (folderId !== 'root') {
      currentFolder = await getAsync('SELECT * FROM folders WHERE id = ? AND user_id = ?', [folderId, userId]);
      if (!currentFolder) {
        return res.status(404).json({ error: 'Folder not found' });
      }
    }

    const subfolders = await allAsync(
      'SELECT * FROM folders WHERE user_id = ? AND parent_id ' + (folderId === 'root' ? 'IS NULL' : '= ?') + ' ORDER BY name ASC',
      folderId === 'root' ? [userId] : [userId, folderId]
    );

    const files = await allAsync(
      'SELECT id, name, original_name, mime_type, size, hash, is_trashed, created_at, updated_at FROM files WHERE user_id = ? AND is_trashed = 0 AND folder_id ' +
        (folderId === 'root' ? 'IS NULL' : '= ?') +
        ' ORDER BY name ASC',
      folderId === 'root' ? [userId] : [userId, folderId]
    );

    return res.json({
      folder: currentFolder,
      contents: {
        subfolders,
        files,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function renameFolder(req: AuthRequest, res: Response) {
  try {
    const parseResult = updateFolderSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Validation error', details: parseResult.error.format() });
    }

    const { name } = parseResult.data;
    const folderId = req.params.id;
    const userId = req.user!.id;

    const folder = await getAsync('SELECT id FROM folders WHERE id = ? AND user_id = ?', [folderId, userId]);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    await runAsync('UPDATE folders SET name = ? WHERE id = ?', [name, folderId]);

    return res.json({ message: 'Folder renamed successfully', folder_id: folderId, new_name: name });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function deleteFolder(req: AuthRequest, res: Response) {
  try {
    const folderId = req.params.id;
    const userId = req.user!.id;

    const folder = await getAsync('SELECT id FROM folders WHERE id = ? AND user_id = ?', [folderId, userId]);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    await runAsync('DELETE FROM folders WHERE id = ?', [folderId]);

    return res.json({ message: 'Folder deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
