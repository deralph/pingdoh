// src/lib/api.ts
export type AiFileScore = {
  filename: string;
  pitch: number;
  rhythm: number;
  tone: number;
  expression: number;
  consistency: number;
  final_score: number;
  rank?: number | null;
};

export type AiResult = {
  task_id?: string;
  status?: string;
  results?: AiFileScore[];
  message?: string;
  [k: string]: any;
};

export type Recording = {
  id: string;
  email: string;
  audio_url: string;
  status: "pending" | "under_review" | "scored" | "closed";
  ai_score: number | null;
  created_at: string | Date;
  ai_result?: AiResult | null;
};

export const api = {
  uploadRecording: async (
    email: string,
    audioBlob: Blob
  ): Promise<{ recording: Recording }> => {
    const formData = new FormData();
    formData.append("email", email);
    formData.append("audio", audioBlob, "recording.webm");

    const response = await fetch("/api/recordings", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const err = await response
        .json()
        .catch(() => ({ message: "Upload failed" }));
      throw new Error(err.message || "Upload failed");
    }

    return (await response.json()) as { recording: Recording };
  },

  getRecording: async (id: string): Promise<{ recording: Recording }> => {
    const resp = await fetch(`/api/recordings/${encodeURIComponent(id)}`);
    if (!resp.ok) throw new Error("Failed to fetch recording");
    return (await resp.json()) as { recording: Recording };
  },

  waitForAiResult: async (
    recordingId: string,
    { interval = 2000, timeout = 120000 } = {}
  ) => {
    const start = Date.now();
    while (true) {
      const { recording } = await api.getRecording(recordingId);
      if (recording.ai_score !== null && recording.ai_score !== undefined) {
        return recording;
      }
      if (recording.status === "closed") {
        throw new Error("AI evaluation failed/closed");
      }
      if (Date.now() - start > timeout) {
        throw new Error("Timed out waiting for AI result");
      }
      await new Promise((r) => setTimeout(r, interval));
    }
  },

  getAllRecordings: async () => {
    const resp = await fetch("/api/recordings");
    if (!resp.ok) throw new Error("Failed to get recordings");
    return (await resp.json()) as { recordings: Recording[] };
  },

  getUserStatus: async (email: string) => {
    const resp = await fetch(`/api/status?email=${encodeURIComponent(email)}`);
    if (!resp.ok) throw new Error("Failed to get status");
    return (await resp.json()) as {
      recording: Recording | null;
      has_submitted: boolean;
    };
  },

  getPortalStatus: async () => {
    const resp = await fetch("/api/portal-status");
    if (!resp.ok) throw new Error("Failed to get portal status");
    return (await resp.json()) as { is_open: boolean };
  },

  closeAuditionPortal: async () => {
    const resp = await fetch("/api/close_audition", { method: "POST" });
    if (!resp.ok) throw new Error("Failed to close audition");
    return await resp.json();
  },

  getLeaderboard: async () => {
    const resp = await fetch("/api/leaderboard");
    if (!resp.ok) throw new Error("Failed to get leaderboard");
    return (await resp.json()) as { leaderboard: Recording[] };
  },
};
