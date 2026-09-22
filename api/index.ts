import app from '../src/app';
import { initDatabase } from '../src/db/database';

let dbInitialized = false;

export default async function handler(req: any, res: any) {
  if (!dbInitialized) {
    try {
      await initDatabase();
      dbInitialized = true;
    } catch (err) {
      console.error('Failed to initialize database on serverless boot:', err);
    }
  }

  return app(req, res);
}
