import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { requestIdMiddleware } from './middlewares/requestId.middleware';
import { globalRateLimiter } from './middlewares/rateLimiter.middleware';
import { errorHandler } from './middlewares/error.middleware';
import routes from './routes/index';

const app = express();

// --- Core Hardening & Request Middlewares ---
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Echo back the requesting origin dynamically to support credentials across all IPs and Wi-Fis
      callback(null, origin || 'http://localhost:5173');
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(requestIdMiddleware);
app.use(globalRateLimiter);

if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// --- API Router Mount ---
app.use(env.API_PREFIX, routes);

// --- Global Error Handling Middleware ---
app.use(errorHandler);

export default app;
