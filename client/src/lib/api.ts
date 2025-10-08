// src/lib/api.ts
export type AiResult = any; // refine if you have strict types
export type RecordingResponse = { recording: any };

export const api = {
  uploadRecording: async (
    email: string,
    audioBlob: Blob
  ): Promise<RecordingResponse> => {
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

    return (await response.json()) as RecordingResponse;
  },

  waitForAiResult: async (
    recordingId: string,
    { interval = 2000, timeout = 120000 } = {}
  ) => {
    const start = Date.now();
    while (true) {
      const resp = await fetch(
        `/api/recordings/${encodeURIComponent(recordingId)}`
      );
      if (!resp.ok) throw new Error("Failed to fetch recording");
      const { recording } = await resp.json();

      if (recording.ai_score !== null && recording.ai_score !== undefined) {
        return recording; // contains ai_score & full ai_result
      }

      if (
        recording.status === "ai_failed" ||
        recording.status === "ai_timeout"
      ) {
        throw new Error("AI evaluation failed or timed out");
      }

      if (Date.now() - start > timeout) {
        throw new Error("Timed out waiting for AI result");
      }

      await new Promise((r) => setTimeout(r, interval));
    }
  },

  getUserStatus: async (email: string) => {
    const response = await fetch(
      `/api/status?email=${encodeURIComponent(email)}`
    );
    if (!response.ok) {
      throw new Error("Failed to get status");
    }
    return response.json();
  },

  getLeaderboard: async () => {
    const response = await fetch("/api/leaderboard");
    if (!response.ok) {
      throw new Error("Failed to get leaderboard");
    }
    return response.json();
  },

  getPortalStatus: async () => {
    const response = await fetch("/api/portal-status");
    if (!response.ok) {
      throw new Error("Failed to get portal status");
    }
    return response.json();
  },

  getAllRecordings: async () => {
    const response = await fetch("/api/recordings");
    if (!response.ok) {
      throw new Error("Failed to get recordings");
    }
    return response.json();
  },

  closeAuditionPortal: async () => {
    const response = await fetch("/api/close_audition", { method: "POST" });
    if (!response.ok) {
      throw new Error("Failed to close audition");
    }
    return response.json();
  },
};
