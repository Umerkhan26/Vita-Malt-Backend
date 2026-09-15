import app from './app';
import mongoose from 'mongoose';
import http from 'http';

const port = process.env.PORT || 3001;
const dbUrl = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/vita-malt-2026';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET must be set to at least 16 characters in .env');
  process.exit(1);
}

const server = http.createServer(app);

mongoose
  .connect(dbUrl)
  .then(() => {
    console.log('Connected to MongoDB');
    server.listen(port, () => {
      console.log(`Vita Malt API running at http://localhost:${port}`);
      console.log(`Health: http://localhost:${port}/health`);
    });
  })
  .catch((err: Error) => {
    console.error('Failed to connect to MongoDB', err.message);
    process.exit(1);
  });
