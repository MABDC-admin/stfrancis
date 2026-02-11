/**
 * Input validation and sanitization middleware
 * Production-ready input validation for API endpoints
 */

// Sanitize string input - remove potential XSS vectors
export const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
};

// Recursively sanitize object properties
export const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeString(key)] = sanitizeObject(value);
    }
    return sanitized;
  }
  return obj;
};

// Middleware to sanitize request body
export const sanitizeBody = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  next();
};

// Middleware to sanitize query parameters
export const sanitizeQuery = (req, res, next) => {
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  next();
};

// Validate UUID format
export const isValidUUID = (str) => {
  if (typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

// Validate email format
export const isValidEmail = (str) => {
  if (typeof str !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(str);
};

// Middleware to validate required fields in request body
export const validateRequired = (fields) => {
  return (req, res, next) => {
    const missing = fields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });
    
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        fields: missing,
      });
    }
    next();
  };
};

// Middleware to validate UUID parameters
export const validateUUIDParam = (paramName) => {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (value && !isValidUUID(value)) {
      return res.status(400).json({
        error: `Invalid ${paramName} format`,
      });
    }
    next();
  };
};

// Add caching headers for GET requests
export const cacheHeaders = (maxAge = 0) => {
  return (req, res, next) => {
    if (req.method === 'GET') {
      if (maxAge > 0) {
        res.set('Cache-Control', `public, max-age=${maxAge}`);
      } else {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
      }
    }
    next();
  };
};

// Middleware to limit request body size for specific routes
export const limitBodySize = (maxSize) => {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > maxSize) {
      return res.status(413).json({
        error: 'Request entity too large',
        maxSize: maxSize,
      });
    }
    next();
  };
};

export default {
  sanitizeString,
  sanitizeObject,
  sanitizeBody,
  sanitizeQuery,
  isValidUUID,
  isValidEmail,
  validateRequired,
  validateUUIDParam,
  cacheHeaders,
  limitBodySize,
};
