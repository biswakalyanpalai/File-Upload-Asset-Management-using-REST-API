import app from './app';
import { config } from './config';
import { initDatabase } from './db/database';

async function bootstrap() {
  try {
    await initDatabase();
    console.log('Database initialized successfully.');

    app.listen(config.port, () => {
      console.log(`Server running at http://localhost:${config.port}`);
      console.log(`Storage directory set to: ${config.storageDir}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
