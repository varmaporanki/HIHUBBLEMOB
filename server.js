import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'dist')));

const PORT = process.env.PORT || 3000;

// Temporary in-memory store for OTPs
const otps = new Map();

// Temporary in-memory store for registered users (persisted across devices)
const registeredUsers = new Map();

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'ansoceanversetechnologies@gmail.com',
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Endpoint to generate and send OTP
app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Store OTP with timestamp (valid for 5 minutes)
  otps.set(email.toLowerCase(), {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  const mailOptions = {
    from: `"Hi-Hubble Security" <${process.env.EMAIL_USER || 'ansoceanversetechnologies@gmail.com'}>`,
    to: email,
    subject: 'Your Hi-Hubble Verification Code',
    html: `
      <div style="font-family: 'Outfit', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; background: #0d061c; border-radius: 24px; color: #ffffff; border: 1px solid rgba(255,255,255,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #a855f7; font-size: 32px; font-weight: 800; margin: 0;">Hi-Hubble</h1>
          <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 5px 0 0 0;">Connect • Share • Belong</p>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 30px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); text-align: center;">
          <p style="font-size: 16px; color: rgba(255,255,255,0.8); margin-top: 0;">Please use the following One-Time Password (OTP) to verify your account. This code is valid for 5 minutes.</p>
          <div style="font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #ff4fa3; margin: 20px 0; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 12px; display: inline-block;">
            ${otp}
          </div>
          <p style="font-size: 12px; color: rgba(255,255,255,0.4); margin-bottom: 0;">If you did not request this verification, please ignore this email.</p>
        </div>
      </div>
    `
  };

  try {
    if (!process.env.EMAIL_PASS || process.env.EMAIL_PASS === 'your_gmail_app_password') {
      throw new Error("SMTP credentials are not configured in the .env file.");
    }
    await transporter.sendMail(mailOptions);
    console.log(`OTP sent successfully to ${email}`);
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error.message);
    console.log('\x1b[33m%s\x1b[0m', `[DEVELOPMENT MODE - OTP CODE FOR ${email} IS: ${otp}]`);
    res.status(500).json({ 
      error: 'Failed to send OTP email via SMTP', 
      details: error.message,
      devFallbackOtp: otp
    });
  }
});

// Endpoint to verify OTP
app.post('/api/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const record = otps.get(email.toLowerCase());
  if (!record) {
    return res.status(400).json({ error: 'No OTP generated for this email' });
  }

  if (Date.now() > record.expiresAt) {
    otps.delete(email.toLowerCase());
    return res.status(400).json({ error: 'OTP has expired' });
  }

  if (record.otp !== otp) {
    return res.status(400).json({ error: 'Invalid verification code' });
  }

  // Clear OTP on successful verification
  otps.delete(email.toLowerCase());
  res.json({ success: true, message: 'OTP verified successfully' });
});

// Endpoint to register a user
app.post('/api/register-user', (req, res) => {
  const { username, userData } = req.body;
  if (!username || !userData) {
    return res.status(400).json({ error: 'Username and userData are required' });
  }
  registeredUsers.set(username.toLowerCase(), userData);
  res.json({ success: true, message: 'User registered successfully on server' });
});

// Endpoint to get user data
app.get('/api/get-user/:username', (req, res) => {
  const username = req.params.username;
  const userData = registeredUsers.get(username.toLowerCase());
  if (!userData) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ success: true, userData });
});

// Fallback all other requests to frontend SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
  });
}

export default app;
