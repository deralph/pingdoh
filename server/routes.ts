import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertRecordingSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for audio file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Enable CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Serve uploaded files
  app.use('/uploads', express.static(uploadDir));

  // User authentication/identification
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      let user = await storage.getUserByEmail(email);
      if (!user) {
        user = await storage.createUser({ email });
      }

      res.json({ user });
    } catch (error) {
      res.status(500).json({ message: 'Login failed', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Upload recording
  app.post('/api/recordings', upload.single('audio'), async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || !req.file) {
        return res.status(400).json({ message: 'Email and audio file are required' });
      }

      // Check if portal is open
      const portalStatus = await storage.getPortalStatus();
      if (!portalStatus.is_open) {
        return res.status(403).json({ message: 'Audition portal is closed' });
      }

      // Check if user already has a recording
      const existingRecordings = await storage.getRecordingsByEmail(email);
      if (existingRecordings.length > 0) {
        return res.status(400).json({ message: 'User already has a recording submitted' });
      }

      const audioUrl = `/uploads/${req.file.filename}`;
      const recording = await storage.createRecording({
        email,
        audio_url: audioUrl,
        status: "pending"
      });

      res.json({ recording });
    } catch (error) {
      res.status(500).json({ message: 'Recording upload failed', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get all recordings (admin only)
  app.get('/api/recordings', async (req, res) => {
    try {
      const recordings = await storage.getAllRecordings();
      res.json({ recordings });
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch recordings', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Close audition portal and trigger AI scoring
  app.post('/api/close_audition', async (req, res) => {
    try {
      await storage.setPortalStatus({ is_open: false });

      // Trigger AI scoring simulation
      const recordings = await storage.getAllRecordings();
      const scoringPromises = recordings
        .filter(r => r.ai_score === null)
        .map(async (recording) => {
          const aiScore = Math.floor(Math.random() * 101); // Random 0-100
          return storage.updateRecording(recording.id, { 
            ai_score: aiScore, 
            status: "scored" 
          });
        });

      await Promise.all(scoringPromises);

      res.json({ message: 'Audition portal closed and AI scoring completed' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to close audition portal', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get user status
  app.get('/api/status', async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const recordings = await storage.getRecordingsByEmail(email as string);
      const recording = recordings[0] || null;
      
      res.json({ 
        recording,
        has_submitted: !!recording
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to get status', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get leaderboard
  app.get('/api/leaderboard', async (req, res) => {
    try {
      const recordings = await storage.getAllRecordings();
      const scoredRecordings = recordings
        .filter(r => r.ai_score !== null)
        .sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0));

      res.json({ leaderboard: scoredRecordings });
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch leaderboard', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get portal status
  app.get('/api/portal-status', async (req, res) => {
    try {
      const status = await storage.getPortalStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get portal status', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
