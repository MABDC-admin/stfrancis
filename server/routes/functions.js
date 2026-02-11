/**
 * Migrated Supabase Edge Functions → Express Routes
 * These routes replace the Supabase Edge Functions for VPS deployment
 */

import express from 'express';
import QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import { verifyToken } from '../auth/jwt.js';

const router = express.Router();

// ============================================
// QR CODE GENERATION
// ============================================
router.post('/generate-student-qr', verifyToken, async (req, res) => {
  try {
    const { student_id } = req.body;

    if (!student_id) {
      return res.status(400).json({ error: 'student_id is required' });
    }

    console.log(`Generating QR code for student: ${student_id}`);

    // Fetch student data
    const studentResult = await pool.query(
      'SELECT lrn, student_name, school_id FROM students WHERE id = $1',
      [student_id]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = studentResult.rows[0];

    // Fetch credentials
    const credsResult = await pool.query(
      'SELECT temp_password FROM user_credentials WHERE student_id = $1',
      [student_id]
    );
    const creds = credsResult.rows[0];

    // Get school code
    let schoolCode = '';
    if (student.school_id) {
      const schoolResult = await pool.query(
        'SELECT code FROM schools WHERE id = $1',
        [student.school_id]
      );
      schoolCode = schoolResult.rows[0]?.code || '';
    }

    const qrPayload = JSON.stringify({
      lrn: student.lrn || '',
      password: creds?.temp_password || '',
      school: schoolCode,
      generated: new Date().toISOString(),
    });

    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 200,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });

    console.log(`QR code generated for ${student.student_name}`);
    res.json({ qr_data_url: qrDataUrl });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// EMAIL SENDING (Enrollment)
// ============================================
router.post('/send-enrollment-email', verifyToken, async (req, res) => {
  try {
    const { to, studentName, school, username, password, qrCodeUrl } = req.body;

    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
      console.log('RESEND_API_KEY not set. Mocking email send.');
      console.log(`To: ${to}, Student: ${studentName}, School: ${school}`);
      return res.json({ success: true, message: 'Email mocked (API key missing)' });
    }

    const subject = `Welcome to ${school} - Enrollment Confirmation`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Enrollment Confirmed!</h2>
        <p>Dear Parent,</p>
        <p>We are pleased to confirm that <strong>${studentName}</strong> has been successfully enrolled at <strong>${school}</strong>.</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Student Portal Credentials</h3>
          <p><strong>Username:</strong> ${username}</p>
          <p><strong>Password:</strong> ${password || '********'}</p>
        </div>

        ${qrCodeUrl ? `
        <div style="text-align: center; margin: 20px 0;">
          <h3>Student ID Badge</h3>
          <p>Please save this QR code for attendance scanning.</p>
          <img src="${qrCodeUrl}" alt="Student QR Code" style="width: 200px; height: 200px; border: 1px solid #ddd; padding: 10px; border-radius: 8px;" />
        </div>
        ` : ''}

        <p>You can log in to the student portal to view grades, schedules, and more.</p>
        
        <p>Best regards,<br>The Registrar Team</p>
      </div>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Registrar <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      res.json(data);
    } else {
      console.error('Resend API Error:', data);
      res.status(400).json({ error: data });
    }
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// EMAIL SENDING (Admission)
// ============================================
router.post('/send-admission-email', verifyToken, async (req, res) => {
  try {
    const { to, studentName, school, status, message } = req.body;

    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
      console.log('RESEND_API_KEY not set. Mocking email send.');
      return res.json({ success: true, message: 'Email mocked (API key missing)' });
    }

    const subject = `${school} - Admission ${status === 'approved' ? 'Approved' : 'Update'}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Admission ${status === 'approved' ? 'Approved!' : 'Status Update'}</h2>
        <p>Dear Parent,</p>
        <p>Regarding the admission application for <strong>${studentName}</strong> at <strong>${school}</strong>:</p>
        
        <div style="background-color: ${status === 'approved' ? '#d4edda' : '#fff3cd'}; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Status:</strong> ${status}</p>
          ${message ? `<p>${message}</p>` : ''}
        </div>

        <p>Best regards,<br>The Admissions Team</p>
      </div>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Admissions <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      res.json(data);
    } else {
      res.status(400).json({ error: data });
    }
  } catch (error) {
    console.error('Error sending admission email:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// USER/CREDENTIAL CREATION
// ============================================

router.post('/create-users', verifyToken, async (req, res) => {
  try {
    const { username, password, role, student_id, school_id, name, teacher_id } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: 'username, password, and role are required' });
    }

    console.log(`Creating user credentials: ${username}, role: ${role}`);

    // Check if username already exists
    const existingUser = await pool.query(
      'SELECT id FROM user_credentials WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // Insert user credentials
    const result = await pool.query(
      `INSERT INTO user_credentials (id, username, password_hash, temp_password, role, student_id, school_id, teacher_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, username, role`,
      [userId, username, password_hash, password, role, student_id || null, school_id || null, teacher_id || null]
    );

    // Insert into user_roles if applicable
    if (role && school_id) {
      await pool.query(
        `INSERT INTO user_roles (id, user_id, role, school_id, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT DO NOTHING`,
        [uuidv4(), userId, role, school_id]
      );
    }

    console.log(`User created successfully: ${username}`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ZOOM AUTHENTICATION
// ============================================
async function getZoomAccessToken() {
  const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
  const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;
  const ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;

  const auth = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  
  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}` },
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.reason || 'Failed to get Zoom access token');
  }
  return data.access_token;
}

async function getZakToken(accessToken) {
  const response = await fetch('https://api.zoom.us/v2/users/me/token?type=zak', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Failed to get ZAK token');
  }
  return data.token;
}

function generateZoomSignature(meetingNumber, role) {
  const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
  const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;

  const iat = Math.round(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2; // 2 hours

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sdkKey: ZOOM_CLIENT_ID,
    mn: meetingNumber,
    role: role,
    iat: iat,
    exp: exp,
    tokenExp: exp,
  };

  const sHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const sPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${sHeader}.${sPayload}`;

  const signature = crypto
    .createHmac('sha256', ZOOM_CLIENT_SECRET)
    .update(data)
    .digest('base64url');

  return `${data}.${signature}`;
}

router.post('/zoom-auth', verifyToken, async (req, res) => {
  try {
    const { ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_ACCOUNT_ID } = process.env;

    if (!ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET || !ZOOM_ACCOUNT_ID) {
      return res.status(500).json({ error: 'Zoom credentials not configured' });
    }

    const { meetingNumber, role = 0 } = req.body;

    if (!meetingNumber) {
      return res.status(400).json({ error: 'meetingNumber is required' });
    }

    console.log(`Generating Zoom credentials for meeting: ${meetingNumber}, role: ${role}`);

    const accessToken = await getZoomAccessToken();
    const zakToken = role === 1 ? await getZakToken(accessToken) : null;
    const signature = generateZoomSignature(meetingNumber, role);

    res.json({
      signature,
      zakToken,
      sdkKey: ZOOM_CLIENT_ID,
    });
  } catch (error) {
    console.error('Zoom Auth Error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// AI CHAT (Notebook/Document Analysis)
// ============================================
router.post('/notebook-chat', verifyToken, async (req, res) => {
  try {
    const { messages, systemPrompt, model = 'gpt-4o-mini', pdfText, pdfFilename } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    // Prepare messages
    const formattedMessages = [];

    if (pdfText) {
      const pdfSystemPrompt = systemPrompt ||
        `You are a helpful AI assistant analyzing a document. The user has uploaded a PDF file${pdfFilename ? ` named "${pdfFilename}"` : ''}. 
Analyze the document content carefully and respond to the user's questions based on this document.
Provide clear, well-structured responses using markdown formatting.`;

      formattedMessages.push({ role: 'system', content: pdfSystemPrompt });

      const lastUserMessage = messages[messages.length - 1];
      const otherMessages = messages.slice(0, -1);

      formattedMessages.push(...otherMessages);

      const userPromptWithPdf = `[DOCUMENT START]
${pdfText}
[DOCUMENT END]

User's request: ${lastUserMessage.content}`;

      formattedMessages.push({ role: 'user', content: userPromptWithPdf });
    } else {
      if (systemPrompt) {
        formattedMessages.push({ role: 'system', content: systemPrompt });
      }
      formattedMessages.push(...messages);
    }

    console.log(`AI chat: ${formattedMessages.length} messages, model: ${model}`);

    // Call OpenAI API with streaming
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenAI API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ error: `AI service error: ${response.status}` });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Stream the response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

          const data = trimmedLine.slice(6);
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
      res.end();
    }
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PROXY ROUTES (for external services)
// ============================================

// Generic proxy helper
async function proxyRequest(req, res, targetUrl, headers = {}) {
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error(`Proxy error to ${targetUrl}:`, error);
    res.status(500).json({ error: error.message });
  }
}

// TacticalRMM Proxy
router.all('/tacticalrmm-proxy/*', verifyToken, async (req, res) => {
  const TACTICALRMM_URL = process.env.TACTICALRMM_URL;
  const TACTICALRMM_API_KEY = process.env.TACTICALRMM_API_KEY;

  if (!TACTICALRMM_URL || !TACTICALRMM_API_KEY) {
    return res.status(500).json({ error: 'TacticalRMM not configured' });
  }

  const path = req.params[0] || '';
  const targetUrl = `${TACTICALRMM_URL}/${path}`;

  await proxyRequest(req, res, targetUrl, {
    'X-API-KEY': TACTICALRMM_API_KEY,
  });
});

// NocoDB Proxy
router.all('/nocodb-proxy/*', verifyToken, async (req, res) => {
  const NOCODB_URL = process.env.NOCODB_URL;
  const NOCODB_API_KEY = process.env.NOCODB_API_KEY;

  if (!NOCODB_URL || !NOCODB_API_KEY) {
    return res.status(500).json({ error: 'NocoDB not configured' });
  }

  const path = req.params[0] || '';
  const targetUrl = `${NOCODB_URL}/${path}`;

  await proxyRequest(req, res, targetUrl, {
    'xc-token': NOCODB_API_KEY,
  });
});

// Documize Proxy
router.all('/documize-proxy/*', verifyToken, async (req, res) => {
  const DOCUMIZE_URL = process.env.DOCUMIZE_URL;

  if (!DOCUMIZE_URL) {
    return res.status(500).json({ error: 'Documize not configured' });
  }

  const path = req.params[0] || '';
  const targetUrl = `${DOCUMIZE_URL}/${path}`;

  await proxyRequest(req, res, targetUrl);
});

// Omada Controller Proxy
router.all('/omada-proxy/*', verifyToken, async (req, res) => {
  const OMADA_URL = process.env.OMADA_URL;

  if (!OMADA_URL) {
    return res.status(500).json({ error: 'Omada not configured' });
  }

  const path = req.params[0] || '';
  const targetUrl = `${OMADA_URL}/${path}`;

  await proxyRequest(req, res, targetUrl);
});

export default router;
