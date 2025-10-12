// server-recordings.routes.ts
import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage"; // your MemStorage
import multer from "multer";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { randomUUID } from "crypto";

const AI_BASE = "http://16.170.164.187"; // temporary AI base

// Ensure ffmpeg path is set for fluent-ffmpeg
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
} else {
  console.warn(
    "ffmpeg-static not found — ensure ffmpeg is installed on PATH for audio conversion to work."
  );
}

// uploads dir
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Use diskStorage so we can preserve extension
const storageMulter = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const filename = `${Date.now()}-${randomUUID()}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage: storageMulter,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) cb(null, true);
    else cb(new Error("Only audio files are allowed"));
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB cap (adjust as needed)
});

// utility: convert arbitrary audio file to mp3 (mono, 16k)
function convertToMp3(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // ensure output directory exists
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    // fluent-ffmpeg command: convert to mp3, mono, 16000Hz
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .format("mp3")
      .on("error", (err: any) => {
        reject(err);
      })
      .on("end", () => {
        resolve();
      })
      .save(outputPath);
  });
}

// upload mp3 to AI and poll results (robust)
async function sendMp3ToAiAndUpdateRecording(
  mp3Path: string,
  recordingId: string
) {
  const simulateIfNoAi = false; // toggle true for dev simulation if you don't have a real AI_BASE
  const uploadRetries = 3;
  const uploadBackoffMs = 1000;
  const pollIntervalMs = 2000;
  const pollMaxAttempts = 120;

  try {
    if (!AI_BASE) {
      if (simulateIfNoAi) {
        // simulate scoring
        const ai_score = Math.floor(Math.random() * 101);
        await storage.updateRecording(recordingId, {
          status: "scored",
          ai_score,
          ai_result: {
            simulated: true,
            message: "Simulated score (AI_BASE not configured)",
          },
        });
        console.log(
          "Simulated AI scoring for",
          recordingId,
          "score:",
          ai_score
        );
        return;
      } else {
        const errMsg =
          "AI_BASE not configured in environment. Set AI_BASE to your AI host.";
        console.error(errMsg);
        await storage.updateRecording(recordingId, {
          status: "closed",
          ai_score: null,
          ai_result: { error: errMsg },
        });
        return;
      }
    }

    // UPLOAD mp3 with retries
    const form = new FormData();
    form.append("files", fs.createReadStream(mp3Path), {
      filename: path.basename(mp3Path),
    });

    let uploadJson: any = null;
    let lastUploadErr: any = null;
    for (let attempt = 1; attempt <= uploadRetries; attempt++) {
      try {
        const resp = await fetch(`${AI_BASE}/evaluate/upload`, {
          method: "POST",
          body: form as any,
          // @ts-ignore - form.getHeaders for node
          headers: (form as any).getHeaders
            ? (form as any).getHeaders()
            : undefined,
        });

        const txt = await resp.text().catch(() => "");
        if (!resp.ok) {
          lastUploadErr = { status: resp.status, body: txt };
          console.warn(
            `AI upload attempt ${attempt} failed status=${resp.status} body=${txt}`
          );
          // retry
        } else {
          // parse JSON if possible
          try {
            uploadJson = JSON.parse(txt || "{}");
          } catch {
            uploadJson = {};
          }
          break;
        }
      } catch (err: any) {
        lastUploadErr = err;
        console.warn(
          `AI upload attempt ${attempt} threw:`,
          err?.message ?? err
        );
      }
      await new Promise((r) => setTimeout(r, uploadBackoffMs * attempt));
    }

    if (!uploadJson) {
      console.error("AI upload failed after retries:", lastUploadErr);
      await storage.updateRecording(recordingId, {
        status: "closed",
        ai_score: null,
        ai_result: {
          error: "AI upload failed after retries",
          detail: String(lastUploadErr?.message ?? lastUploadErr),
        },
      });
      return;
    }

    const taskId: string | undefined = uploadJson?.task_id;
    if (!taskId) {
      console.error("AI upload returned no task_id:", uploadJson);
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

    console.log(
      `AI upload successful, task_id=${taskId}. Marking under_review.`
    );
    await storage.updateRecording(recordingId, { status: "under_review" });

    // Poll results
    let attempt = 0;
    let finalResult: any = null;
    let lastPollError: any = null;

    while (attempt < pollMaxAttempts) {
      attempt++;
      try {
        const res = await fetch(
          `${AI_BASE}/evaluate/results/${encodeURIComponent(taskId)}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
          }
        );

        const text = await res.text().catch(() => "");
        if (res.ok) {
          try {
            finalResult = JSON.parse(text || "{}");
          } catch {
            finalResult = {};
          }

          const statusStr = String(finalResult?.status ?? "").toLowerCase();
          if (statusStr === "completed" || statusStr === "failed") {
            console.log(`AI task ${taskId} finished with status=${statusStr}`);
            break;
          } else {
            console.log(
              `AI task ${taskId} status=${
                statusStr || "unknown"
              } (attempt ${attempt}) — waiting`
            );
          }
        } else {
          // often AI returns 400 {"detail":"Evaluation not completed..."} -> treat as retriable
          let parsedBody: any = null;
          try {
            parsedBody = JSON.parse(text || "");
          } catch {
            parsedBody = { raw: text };
          }
          const detail = String(
            parsedBody?.detail ?? parsedBody?.message ?? ""
          );
          if (res.status === 400 && /evaluation not completed/i.test(detail)) {
            console.log(`AI results not ready (attempt ${attempt}): ${detail}`);
            // continue polling
          } else {
            lastPollError = { status: res.status, body: parsedBody };
            console.warn(
              `AI results check attempt ${attempt} returned status=${res.status} body=`,
              parsedBody
            );
          }
        }
      } catch (err: any) {
        lastPollError = err;
        console.warn(
          `Error polling AI results attempt ${attempt}:`,
          err?.message ?? err
        );
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    if (!finalResult) {
      console.error(
        "AI polling timed out or never returned completed/failed",
        lastPollError
      );
      await storage.updateRecording(recordingId, {
        status: "closed",
        ai_score: null,
        ai_result: {
          error: "AI polling timed out",
          detail: String(lastPollError?.message ?? lastPollError),
        },
      });
      return;
    }

    // compute ai_score (highest final_score if present)
    const resultsArray = Array.isArray(finalResult.results)
      ? finalResult.results
      : [];
    const ai_score =
      resultsArray.length > 0
        ? resultsArray.reduce(
            (max: number, r: any) => Math.max(max, Number(r.final_score ?? 0)),
            0
          )
        : null;
    const finalStatus =
      String(finalResult.status ?? "").toLowerCase() === "completed"
        ? "scored"
        : "closed";

    await storage.updateRecording(recordingId, {
      status: finalStatus,
      ai_score,
      ai_result: finalResult,
    });

    console.log(
      `Recording ${recordingId} updated with status=${finalStatus} ai_score=${ai_score}`
    );
  } catch (err: any) {
    console.error("sendMp3ToAiAndUpdateRecording uncaught error:", err);
    await storage.updateRecording(recordingId, {
      status: "closed",
      ai_score: null,
      ai_result: { error: String(err?.message ?? err) },
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

  // Serve uploads (express will set content-type based on file extension)
  app.use("/uploads", express.static(uploadDir));

  // simple auth endpoint (unchanged)
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      let user = await storage.getUserByEmail(email);
      if (!user) user = await storage.createUser({ email });
      return res.json({ user });
    } catch (err) {
      console.error("login error:", err);
      return res
        .status(500)
        .json({
          message: "Login failed",
          error: String((err as any)?.message ?? err),
        });
    }
  });

  /**
   * POST /api/recordings
   * - saves uploaded file (preserve extension)
   * - converts to MP3 (mono 16k)
   * - create recording with audio_url pointing to the mp3 file
   * - start background sendMp3ToAiAndUpdateRecording(mp3Path, recordingId)
   */
  app.post("/api/recordings", upload.single("audio"), async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || !req.file) {
        return res
          .status(400)
          .json({ message: "Email and audio file are required" });
      }

      const portalStatus = await storage.getPortalStatus();
      if (!portalStatus.is_open) {
        return res.status(403).json({ message: "Audition portal is closed" });
      }

      const existing = await storage.getRecordingsByEmail(email);
      if (existing.length > 0) {
        return res
          .status(400)
          .json({ message: "User already has a recording submitted" });
      }

      const savedFilename = (req.file as any).filename as string; // includes ext
      const savedPath = (req.file as any).path as string; // full path
      const mp3Filename = `${path.parse(savedFilename).name}.mp3`; // same base, .mp3
      const mp3Path = path.join(uploadDir, mp3Filename);
      const mp3Url = `/uploads/${mp3Filename}`;

      // Convert to mp3 (async) - do before creating recording so audio_url points to mp3
      try {
        await convertToMp3(savedPath, mp3Path);
        // optionally remove original file to save space:
        try {
          if (fs.existsSync(savedPath) && savedPath !== mp3Path) {
            fs.unlinkSync(savedPath);
          }
        } catch (e) {
          console.warn("failed to remove original upload:", e);
        }
      } catch (convErr) {
        console.error("Audio conversion to mp3 failed:", convErr);
        // create recording but mark closed and store ai_result error
        const recordingErr = await storage.createRecording({
          email,
          audio_url: `/uploads/${savedFilename}`, // fallback to original file
          status: "closed",
        });
        await storage.updateRecording(recordingErr.id, {
          ai_score: null,
          ai_result: {
            error: "Audio conversion to mp3 failed",
            detail: String((convErr as any)?.message ?? convErr),
          },
        });
        return res
          .status(500)
          .json({
            message: "Audio conversion failed",
            error: String((convErr as any)?.message ?? convErr),
          });
      }

      // create recording (audio_url points to mp3)
      const recording = await storage.createRecording({
        email,
        audio_url: mp3Url,
        status: "pending",
      });

      // Fire-and-forget: send mp3 to AI and update recording
      setImmediate(() => {
        void sendMp3ToAiAndUpdateRecording(mp3Path, recording.id);
      });

      return res.json({ recording });
    } catch (err) {
      console.error("POST /api/recordings error:", err);
      return res
        .status(500)
        .json({
          message: "Recording upload failed",
          error: String((err as any)?.message ?? err),
        });
    }
  });

  // GET single recording (for frontend polling)
  app.get("/api/recordings/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const recording = await storage.getRecording(id);
      if (!recording)
        return res.status(404).json({ message: "Recording not found" });
      return res.json({ recording });
    } catch (err) {
      console.error("GET /api/recordings/:id error:", err);
      return res
        .status(500)
        .json({
          message: "Failed to fetch recording",
          error: String((err as any)?.message ?? err),
        });
    }
  });

  // GET all recordings (admin)
  app.get("/api/recordings", async (req, res) => {
    try {
      const recordings = await storage.getAllRecordings();
      return res.json({ recordings });
    } catch (err) {
      console.error("GET /api/recordings error:", err);
      return res
        .status(500)
        .json({
          message: "Failed to fetch recordings",
          error: String((err as any)?.message ?? err),
        });
    }
  });

  // close audition (simulate scoring unmatched)
  app.post("/api/close_audition", async (req, res) => {
    try {
      await storage.setPortalStatus({ is_open: false });
      const recordings = await storage.getAllRecordings();
      const scoring = recordings
        .filter((r) => r.ai_score === null)
        .map((r) => {
          const s = Math.floor(Math.random() * 101);
          return storage.updateRecording(r.id, {
            ai_score: s,
            status: "scored",
          });
        });
      await Promise.all(scoring);
      return res.json({
        message: "Audition portal closed and AI scoring completed",
      });
    } catch (err) {
      console.error("close_audition error:", err);
      return res
        .status(500)
        .json({
          message: "Failed to close audition",
          error: String((err as any)?.message ?? err),
        });
    }
  });

  // status, leaderboard, portal-status unchanged
  app.get("/api/status", async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) return res.status(400).json({ message: "Email is required" });
      const recordings = await storage.getRecordingsByEmail(email as string);
      const recording = recordings[0] || null;
      return res.json({ recording, has_submitted: !!recording });
    } catch (err) {
      console.error("GET /api/status error:", err);
      return res
        .status(500)
        .json({
          message: "Failed to get status",
          error: String((err as any)?.message ?? err),
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
    } catch (err) {
      console.error("GET /api/leaderboard error:", err);
      return res
        .status(500)
        .json({
          message: "Failed to get leaderboard",
          error: String((err as any)?.message ?? err),
        });
    }
  });

  app.get("/api/portal-status", async (req, res) => {
    try {
      const status = await storage.getPortalStatus();
      return res.json(status);
    } catch (err) {
      console.error("GET /api/portal-status error:", err);
      return res
        .status(500)
        .json({
          message: "Failed to get portal status",
          error: String((err as any)?.message ?? err),
        });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
