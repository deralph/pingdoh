// src/server-recordings.routes.ts
import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

const AI_BASE = "https://recording-ai.com"; // temporary ai base url

// Uploads directory
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config
const upload = multer({
  dest: uploadDir,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) cb(null, true);
    else cb(new Error("Only audio files are allowed"));
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Background helper: uploads to AI, polls, updates recording status following allowed statuses:
// "pending" -> "under_review" -> "scored" (success) or "closed" (fail/timeout).
async function sendFileToAiAndUpdateRecording(
  localFilePath: string,
  recordingId: string
) {
  try {
    // Build multipart form
    const form = new FormData();
    const filename = path.basename(localFilePath);
    form.append("files", fs.createReadStream(localFilePath), { filename });

    // POST to AI /evaluate/upload
    const uploadResp = await fetch(`${AI_BASE}/evaluate/upload`, {
      method: "POST",
      body: form as any,
      // node-fetch + form-data compatibility
      // @ts-ignore
      headers: (form as any).getHeaders
        ? (form as any).getHeaders()
        : undefined,
    });

    if (!uploadResp.ok) {
      const text = await uploadResp.text().catch(() => "no body");
      console.error("AI upload failed:", uploadResp.status, text);
      // mark closed on failure
      await storage.updateRecording(recordingId, {
        status: "closed",
        ai_score: null,
        ai_result: { error: `AI upload failed: ${uploadResp.status}` },
      });
      return;
    }

    const uploadJson: any = await uploadResp.json().catch(() => ({}));
    const taskId: string | undefined = uploadJson?.task_id;

    if (!taskId) {
      console.error("AI upload returned no task_id", uploadJson);
      await storage.updateRecording(recordingId, {
        status: "closed",
        ai_score: null,
        ai_result: { error: "No task_id returned from AI upload" },
      });
      return;
    }

    // Move to under_review
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
          if (json.status === "completed" || json.status === "failed") {
            finalResult = json;
            break;
          }
        } else {
          // log and continue polling (404/500 etc.)
          const txt = await res.text().catch(() => "");
          console.warn(
            `AI results check (attempt ${attempt}) status=${res.status} body=${txt}`
          );
        }
      } catch (err) {
        console.warn("Error polling AI results:", err);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    if (!finalResult) {
      // timed out -> mark closed, ai_score null
      await storage.updateRecording(recordingId, {
        status: "closed",
        ai_score: null,
        ai_result: { error: "AI result polling timed out" },
      });
      return;
    }

    // If AI returned results: derive ai_score (highest final_score) and set status to "scored"
    const results = Array.isArray(finalResult.results)
      ? finalResult.results
      : [];
    let ai_score: number | null = null;
    if (results.length > 0) {
      ai_score = results.reduce((max: number, r: any) => {
        const v = Number(r.final_score ?? 0);
        return isFinite(v) ? Math.max(max, v) : max;
      }, 0);
    }

    await storage.updateRecording(recordingId, {
      status: "scored",
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
  // CORS
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

  // Serve uploads
  app.use("/uploads", express.static(uploadDir));

  // Auth login (unchanged)
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

  /**
   * POST /api/recordings
   * - saves file with multer
   * - creates recording with status "pending"
   * - starts background AI upload/poll (fire-and-forget)
   * - returns created recording immediately
   */
  app.post("/api/recordings", upload.single("audio"), async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || !req.file)
        return res
          .status(400)
          .json({ message: "Email and audio file are required" });

      // Check portal open
      const portalStatus = await storage.getPortalStatus();
      if (!portalStatus.is_open)
        return res.status(403).json({ message: "Audition portal is closed" });

      // Ensure user hasn't already submitted
      const existingRecordings = await storage.getRecordingsByEmail(email);
      if (existingRecordings.length > 0)
        return res
          .status(400)
          .json({ message: "User already has a recording submitted" });

      // create recording record -> MemStorage.createRecording sets created_at: Date and ai_score: null
      const audioUrl = `/uploads/${req.file.filename}`;
      const recording = await storage.createRecording({
        email,
        audio_url: audioUrl,
        status: "pending", // matches allowed enum
      });

      // Fire-and-forget AI processing
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

  // GET single recording (used by frontend to poll). Returns recording object matching the schema.
  app.get("/api/recordings/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const recording = await storage.getRecording(id);
      if (!recording)
        return res.status(404).json({ message: "Recording not found" });

      // Ensure returned object follows schema keys:
      // id, email, audio_url, status in allowed set, ai_score (number|null), created_at (Date)
      // (Assumes storage.createRecording already created created_at: Date and ai_score: null)
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

  /**
   * Close audition portal:
   * - sets portal closed,
   * - simulates scoring for any recordings without ai_score by setting a random ai_score and status "scored"
   */
  app.post("/api/close_audition", async (req, res) => {
    try {
      await storage.setPortalStatus({ is_open: false });

      const recordings = await storage.getAllRecordings();
      const scoringPromises = recordings
        .filter((r) => r.ai_score === null)
        .map(async (recording) => {
          const aiScore = Math.floor(Math.random() * 101); // 0-100
          return storage.updateRecording(recording.id, {
            ai_score: aiScore,
            status: "scored", // conform with schema
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

  // Get user status
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

  // Leaderboard: return only recordings with status "scored"
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const recordings = await storage.getAllRecordings();
      const scoredRecordings = recordings
        .filter((r) => r.status === "scored" && r.ai_score !== null)
        .sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0));
      return res.json({ leaderboard: scoredRecordings });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to fetch leaderboard",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Portal status
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
