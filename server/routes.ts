// server-recordings.routes.ts
import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import { randomUUID } from "crypto";

const AI_BASE = "https://recording-ai.com"; // temporary AI base

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Use diskStorage to preserve original extension
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const filename = `${Date.now()}-${randomUUID()}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage: diskStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) cb(null, true);
    else cb(new Error("Only audio files are allowed"));
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

type RecordingId = string;

/**
 * Upload local file to AI backend, poll result, update storage.
 * Status lifecycle (per your schema):
 * - pending -> under_review -> scored (success) OR closed (fail/timeout)
 */
async function sendFileToAiAndUpdateRecording(
  localFilePath: string,
  recordingId: RecordingId
) {
  try {
    // Build multipart form
    const form = new FormData();
    const filename = path.basename(localFilePath);
    form.append("files", fs.createReadStream(localFilePath), { filename });

    // POST to AI evaluate/upload
    const uploadResp = await fetch(`${AI_BASE}/evaluate/upload`, {
      method: "POST",
      body: form as any,
      // ensure node-fetch + form-data headers are set
      // @ts-ignore
      headers: (form as any).getHeaders
        ? (form as any).getHeaders()
        : undefined,
    });

    if (!uploadResp.ok) {
      const txt = await uploadResp.text().catch(() => "");
      console.error("AI upload failed:", uploadResp.status, txt);
      await storage.updateRecording(recordingId, {
        status: "closed",
        ai_score: null,
        ai_result: {
          error: `AI upload failed (${uploadResp.status})`,
          body: txt,
        },
      });
      return;
    }

    const uploadJson: any = await uploadResp.json().catch(() => ({}));
    const taskId: string | undefined = uploadJson?.task_id;

    if (!taskId) {
      console.error("No task_id from AI upload:", uploadJson);
      await storage.updateRecording(recordingId, {
        status: "closed",
        ai_score: null,
        ai_result: {
          error: "No task_id returned from AI upload",
          raw: uploadJson,
        },
      });
      return;
    }

    // Mark under_review
    await storage.updateRecording(recordingId, { status: "under_review" });

    // Poll for results
    const intervalMs = 2000;
    const maxAttempts = 120; // ~4 minutes
    let attempt = 0;
    let finalResult: any = null;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const res = await fetch(`${AI_BASE}/evaluate/results/${taskId}`);
        if (res.ok) {
          const json: any = await res.json();
          // AI statuses from your FastAPI used: queued/processing/completed/failed (we tolerate variations)
          const s: string = json?.status ?? "";
          if (s === "completed" || s === "failed") {
            finalResult = json;
            break;
          }
          // else keep polling
        } else {
          const txt = await res.text().catch(() => "");
          console.warn(
            `AI results check attempt ${attempt}: ${res.status} ${txt}`
          );
        }
      } catch (err) {
        console.warn("Error polling AI results:", err);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    if (!finalResult) {
      await storage.updateRecording(recordingId, {
        status: "closed",
        ai_score: null,
        ai_result: { error: "AI result polling timed out" },
      });
      return;
    }

    const results = Array.isArray(finalResult.results)
      ? finalResult.results
      : [];
    // derive ai_score (highest final_score). You can change to average if desired.
    const ai_score =
      results.length > 0
        ? results.reduce((max: number, r: any) => {
            const v = Number(r.final_score ?? 0);
            return isFinite(v) ? Math.max(max, v) : max;
          }, 0)
        : null;

    // Update storage as 'scored' or 'closed' based on finalResult.status
    const finalStatus =
      finalResult?.status === "completed" ? "scored" : "closed";
    await storage.updateRecording(recordingId, {
      status: finalStatus,
      ai_score,
      ai_result: finalResult,
    });
  } catch (err) {
    console.error("sendFileToAiAndUpdateRecording error:", err);
    await storage.updateRecording(recordingId, {
      status: "closed",
      ai_score: null,
      ai_result: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // CORS middleware
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Content-Length, X-Requested-With"
    );
    if (req.method === "OPTIONS") res.sendStatus(200);
    else next();
  });

  // Serve static uploads (express will set content-type based on extension)
  app.use("/uploads", express.static(uploadDir));

  // auth/login (same as before)
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      let user = await storage.getUserByEmail(email);
      if (!user) user = await storage.createUser({ email });
      res.json({ user });
    } catch (error) {
      res.status(500).json({
        message: "Login failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Upload recording - preserves extension so audio_url is usable
  app.post("/api/recordings", upload.single("audio"), async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || !req.file)
        return res
          .status(400)
          .json({ message: "Email and audio file are required" });

      const portalStatus = await storage.getPortalStatus();
      if (!portalStatus.is_open)
        return res.status(403).json({ message: "Audition portal is closed" });

      const existing = await storage.getRecordingsByEmail(email);
      if (existing.length > 0)
        return res
          .status(400)
          .json({ message: "User already has a recording submitted" });

      // Use the saved filename (which includes extension)
      const savedFilename = (req.file as any).filename as string;
      const audioUrl = `/uploads/${savedFilename}`;

      // createRecording in MemStorage should set created_at: Date and ai_score: null by default
      const recording = await storage.createRecording({
        email,
        audio_url: audioUrl,
        status: "pending",
      });

      // start background processing (fire-and-forget)
      const localFilePath = (req.file as any).path as string;
      setImmediate(() => {
        void sendFileToAiAndUpdateRecording(localFilePath, recording.id);
      });

      return res.json({ recording });
    } catch (error) {
      return res.status(500).json({
        message: "Recording upload failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // GET single recording (frontend polls this)
  app.get("/api/recordings/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const recording = await storage.getRecording(id);
      if (!recording)
        return res.status(404).json({ message: "Recording not found" });
      return res.json({ recording });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to fetch recording",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // GET all recordings (admin)
  app.get("/api/recordings", async (req, res) => {
    try {
      const recordings = await storage.getAllRecordings();
      return res.json({ recordings });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to fetch recordings",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Close audition portal -> simulated scoring
  app.post("/api/close_audition", async (req, res) => {
    try {
      await storage.setPortalStatus({ is_open: false });
      const recordings = await storage.getAllRecordings();
      const scoringPromises = recordings
        .filter((r) => r.ai_score === null)
        .map(async (rec) => {
          const aiScore = Math.floor(Math.random() * 101);
          return storage.updateRecording(rec.id, {
            ai_score: aiScore,
            status: "scored",
          });
        });
      await Promise.all(scoringPromises);
      return res.json({
        message: "Audition portal closed and AI scoring completed",
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to close audition portal",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // status, leaderboard, portal-status (unchanged)
  app.get("/api/status", async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) return res.status(400).json({ message: "Email is required" });
      const recordings = await storage.getRecordingsByEmail(email as string);
      const recording = recordings[0] || null;
      return res.json({ recording, has_submitted: !!recording });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to get status",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/leaderboard", async (req, res) => {
    try {
      const recordings = await storage.getAllRecordings();
      const scored = recordings
        .filter((r) => r.status === "scored" && r.ai_score !== null)
        .sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0));
      return res.json({ leaderboard: scored });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to fetch leaderboard",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/portal-status", async (req, res) => {
    try {
      const status = await storage.getPortalStatus();
      return res.json(status);
    } catch (error) {
      return res.status(500).json({
        message: "Failed to get portal status",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
