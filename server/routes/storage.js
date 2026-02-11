import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { verifyToken } from '../auth/jwt.js';

const router = express.Router();

// Storage path configuration
const STORAGE_PATH = process.env.STORAGE_PATH || './storage';

// Initialize storage directories synchronously on module load
const folders = ['logos', 'documents', 'photos', 'books', 'student-documents', 'exports', 'temp'];
folders.forEach(folder => {
  const folderPath = path.join(STORAGE_PATH, folder);
  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.params.folder || 'documents';
    const folderPath = path.join(STORAGE_PATH, folder);
    
    // Create folder if it doesn't exist
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
    }
    
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    // Preserve original name with unique prefix
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB default
  },
  fileFilter: (req, file, cb) => {
    // Extended file types
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|json|epub/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    // Also check mimetype
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv', 'application/json', 'application/epub+zip'
    ];
    
    if (extname || allowedMimes.includes(file.mimetype)) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: images, PDF, Office documents, text files'));
    }
  }
});

// Upload single file
router.post('/upload/:folder', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Build the public URL
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
    const fileUrl = `${baseUrl}/api/storage/files/${req.params.folder}/${req.file.filename}`;
    
    res.json({
      url: fileUrl,
      path: `${req.params.folder}/${req.file.filename}`,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Upload multiple files
router.post('/upload-multiple/:folder', verifyToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
    
    const uploadedFiles = req.files.map(file => ({
      url: `${baseUrl}/api/storage/files/${req.params.folder}/${file.filename}`,
      path: `${req.params.folder}/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    }));
    
    res.json({ files: uploadedFiles });
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Serve static files (public access for viewing uploaded files)
router.use('/files', express.static(STORAGE_PATH, {
  maxAge: '1d', // Cache for 1 day
  etag: true,
  lastModified: true,
}));

// List files in a folder
router.get('/list/:folder', verifyToken, async (req, res) => {
  try {
    const folderPath = path.join(STORAGE_PATH, req.params.folder);
    
    if (!existsSync(folderPath)) {
      return res.json({ files: [] });
    }

    const files = await fs.readdir(folderPath);
    const fileDetails = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(folderPath, filename);
        const stats = await fs.stat(filePath);
        return {
          filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
        };
      })
    );
    
    res.json({ files: fileDetails });
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Delete file
router.delete('/:folder/:filename', verifyToken, async (req, res) => {
  try {
    const filePath = path.join(STORAGE_PATH, req.params.folder, req.params.filename);
    
    // Security check: ensure the resolved path is within STORAGE_PATH
    const resolvedPath = path.resolve(filePath);
    const resolvedStoragePath = path.resolve(STORAGE_PATH);
    
    if (!resolvedPath.startsWith(resolvedStoragePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    await fs.unlink(filePath);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed: ' + error.message });
  }
});

// Get file info
router.get('/info/:folder/:filename', verifyToken, async (req, res) => {
  try {
    const filePath = path.join(STORAGE_PATH, req.params.folder, req.params.filename);
    
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stats = await fs.stat(filePath);
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
    
    res.json({
      filename: req.params.filename,
      folder: req.params.folder,
      url: `${baseUrl}/api/storage/files/${req.params.folder}/${req.params.filename}`,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
    });
  } catch (error) {
    console.error('Info error:', error);
    res.status(500).json({ error: 'Failed to get file info' });
  }
});

export default router;

