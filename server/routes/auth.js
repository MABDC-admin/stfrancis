import express from 'express';
import bcrypt from 'bcryptjs';
import { generateToken } from '../auth/jwt.js';
import { query } from '../db.js';

const router = express.Router();

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Handle LRN format (without @)
    const isLRN = !email.includes('@');
    const cleanEmail = isLRN ? `${email.replace(/[^a-zA-Z0-9]/g, '')}@sfxsai.org` : email;

    // Find user
    const result = await query(
      `SELECT p.*, ur.role 
       FROM profiles p
       LEFT JOIN user_roles ur ON p.id = ur.user_id
       WHERE p.email = $1`,
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // For migration: check user_credentials table if no password_hash
    if (!user.password_hash) {
      const credsResult = await query(
        'SELECT password FROM user_credentials WHERE user_id = $1',
        [user.id]
      );

      if (credsResult.rows.length > 0) {
        // Plain text password from old system (TEMPORARY during migration)
        if (password !== credsResult.rows[0].password) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Hash the password for future use
        const hashedPassword = await bcrypt.hash(password, 10);
        await query(
          'UPDATE profiles SET password_hash = $1 WHERE id = $2',
          [hashedPassword, user.id]
        );
      } else {
        return res.status(401).json({ error: 'Account requires setup' });
      }
    } else {
      // Verify hashed password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }

    // Log audit
    await query(
      `INSERT INTO audit_logs (user_id, action, status, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, 'login', 'success', req.headers['user-agent'], req.ip]
    );

    // Generate JWT
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role || 'student',
      full_name: user.full_name,
    });

    // Remove sensitive data
    delete user.password_hash;

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role || 'student',
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const { verifyToken } = await import('../auth/jwt.js');
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const result = await query(
      `SELECT p.id, p.email, p.full_name, ur.role
       FROM profiles p
       LEFT JOIN user_roles ur ON p.id = ur.user_id
       WHERE p.id = $1`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout (client-side token removal mainly)
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
