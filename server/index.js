import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import hpp from 'hpp';
import morgan from 'morgan';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import storageRoutes from './routes/storage.js';
import dataRoutes from './routes/data.js';
import functionsRoutes from './routes/functions.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy for Railway/Vercel deployment
app.set('trust proxy', 1);

// Security middleware - Helmet with production-optimized settings
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL].filter(Boolean),
    }
  } : false,
  hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

// HTTP Parameter Pollution protection
app.use(hpp());

// Compression for all responses
app.use(compression({
  level: 6,
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Request logging - structured for production
if (isProduction) {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// CORS configuration - production domains from environment
const allowedOrigins = isProduction 
  ? [
      process.env.FRONTEND_URL,
      'https://stfrancis.vercel.app',
      'https://sfxsai.com',
      'https://www.sfxsai.com'
    ].filter(Boolean)
  : [
      'http://localhost:8080', 
      'http://localhost:8081', 
      'http://localhost:8082', 
      'http://localhost:8083', 
      'http://localhost:8084'
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400, // 24 hours preflight cache
}));

// Body parsing with size limits
app.use(express.json({ 
  limit: '10mb',
  strict: true,
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 1000,
}));

// Rate limiting - different limits for different endpoints
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: isProduction ? 100 : 1000,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health', // Don't rate limit health checks
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 10 : 100, // 10 login attempts per 15 min in production
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: isProduction ? 'production' : 'development',
    version: process.env.npm_package_version || '1.0.0',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/functions', functionsRoutes);

// 404 handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({ 
    error: 'Not Found',
    path: req.path,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Log error details (don't expose in production)
  console.error(`[${new Date().toISOString()}] Error:`, {
    message: err.message,
    stack: isProduction ? undefined : err.stack,
    path: req.path,
    method: req.method,
  });

  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation' });
  }

  // Validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: isProduction ? undefined : err.details,
    });
  }

  // JWT error
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Database error
  if (err.code && err.code.startsWith('23')) {
    return res.status(400).json({ 
      error: 'Database constraint violation',
      details: isProduction ? undefined : err.detail,
    });
  }

  // Default server error
  res.status(err.status || 500).json({
    error: isProduction ? 'Internal server error' : err.message,
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${isProduction ? 'PRODUCTION' : 'development'}`);
  console.log(`📁 Storage path: ${process.env.STORAGE_PATH || './storage'}`);
  console.log(`🌐 Allowed origins: ${allowedOrigins.join(', ')}`);
});
