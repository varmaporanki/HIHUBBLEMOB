import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from 'socket.io';
import twilio from 'twilio';

import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import postsRoutes from './routes/posts.js';
import reelsRoutes from './routes/reels.js';
import storiesRoutes from './routes/stories.js';
import notificationsRoutes from './routes/notifications.js';
import chatsRoutes from './routes/chats.js';
import callsRoutes from './routes/calls.js';

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());

// --- WEBRTC SOCKET.IO SIGNALING ---
const userSockets = new Map();

io.on('connection', (socket) => {
  socket.on('register', (userId) => {
    userSockets.set(userId, socket.id);
    socket.userId = userId;
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      userSockets.delete(socket.userId);
    }
  });

  socket.on('call-initiate', (data) => {
    const { recipientId, offer, isAudioOnly, callerId, callerName, callerAvatar } = data;
    const recipientSocket = userSockets.get(recipientId);
    if (recipientSocket) {
      io.to(recipientSocket).emit('incoming-call', {
        callerId,
        callerName,
        callerAvatar,
        offer,
        isAudioOnly
      });
    }
  });

  socket.on('call-accept', (data) => {
    const { callerId, answer } = data;
    const callerSocket = userSockets.get(callerId);
    if (callerSocket) {
      io.to(callerSocket).emit('call-accepted', { answer });
    }
  });

  socket.on('call-decline', (data) => {
    const { callerId } = data;
    const callerSocket = userSockets.get(callerId);
    if (callerSocket) {
      io.to(callerSocket).emit('call-declined');
    }
  });

  socket.on('call-end', (data) => {
    const { targetId } = data;
    const targetSocket = userSockets.get(targetId);
    if (targetSocket) {
      io.to(targetSocket).emit('call-ended');
    }
  });

  socket.on('ice-candidate', (data) => {
    const { targetId, candidate } = data;
    const targetSocket = userSockets.get(targetId);
    if (targetSocket) {
      io.to(targetSocket).emit('ice-candidate', { candidate });
    }
  });
});

// Enable large base64 strings
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'dist')));

// Mount API Routes
app.use(authRoutes);
app.use(usersRoutes);
app.use(postsRoutes);
app.use(reelsRoutes);
app.use(storiesRoutes);
app.use(notificationsRoutes);
app.use(chatsRoutes);
app.use(callsRoutes);

// --- TWILIO TURN CREDENTIALS ---
app.get('/api/turn-credentials', async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return res.status(500).json({ error: 'Twilio credentials not configured in .env' });
    }
    const client = twilio(accountSid, authToken);
    const token = await client.tokens.create();
    res.json(token);
  } catch (error) {
    console.error('Error fetching TURN credentials:', error);
    res.status(500).json({ error: 'Failed to fetch TURN credentials' });
  }
});

const PORT = process.env.PORT || 3000;

// Fallback all other requests to frontend SPA
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  httpServer.listen(PORT, () => {
    console.log(`Backend server (HTTP + WebSockets) running on port ${PORT} with Supabase`);
  });
}

export default app;
