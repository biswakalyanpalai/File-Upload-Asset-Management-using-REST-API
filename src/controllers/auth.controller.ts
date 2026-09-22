import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getAsync, runAsync } from '../db/database';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function register(req: Request, res: Response) {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Validation error', details: parseResult.error.format() });
    }

    const { email, password } = parseResult.data;

    const existingUser = await getAsync('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const createdAt = new Date().toISOString();

    await runAsync(
      `INSERT INTO users (id, email, password_hash, storage_used, storage_limit, created_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [userId, email, passwordHash, config.defaultStorageLimitBytes, createdAt]
    );

    const token = jwt.sign({ id: userId, email }, config.jwtSecret, { expiresIn: '7d' });

    return res.status(201).json({
      message: 'User registered successfully',
      user: { id: userId, email, storage_limit: config.defaultStorageLimitBytes },
      token,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Validation error', details: parseResult.error.format() });
    }

    const { email, password } = parseResult.data;

    const user = await getAsync('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, config.jwtSecret, { expiresIn: '7d' });

    return res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        storage_used: user.storage_used,
        storage_limit: user.storage_limit,
      },
      token,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}

export async function getProfile(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const user = await getAsync('SELECT id, email, storage_used, storage_limit, created_at FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      user: {
        ...user,
        storage_used_mb: (user.storage_used / (1024 * 1024)).toFixed(2),
        storage_limit_mb: (user.storage_limit / (1024 * 1024)).toFixed(2),
        quota_used_percentage: ((user.storage_used / user.storage_limit) * 100).toFixed(2) + '%',
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
}
