import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { authMiddleware } from '../auth/jwt.js';

const router = express.Router();

// Ensure storage directory exists
const STORAGE_PATH = process.env.STORAGE_PATH || './storage';
await fs.mkdir(STORAGE_PATH, { recursive: true });
await fs.mkdir(path.join(STORAGE_PATH, 'logos'), { recursive: true });
await fs.mkdir(path.join(STORAGE_PATH, 'documents'), { recursive: true });
await fs.mkdir(path.join(STORAGE_PATH, 'photos'), { recursive: true });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.params.folder || 'documents';
    cb(null, path.join(STORAGE_PATH, folder));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Upload file
router.post('/upload/:folder', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/storage/${req.params.folder}/${req.file.filename}`;
    
    res.json({
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Serve static files
router.use('/files', express.static(STORAGE_PATH));

// Delete file
router.delete('/:folder/:filename', authMiddleware, async (req, res) => {
  try {
    const filePath = path.join(STORAGE_PATH, req.params.folder, req.params.filename);
    await fs.unlink(filePath);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

export default router;
