import { apiRequest } from "./queryClient";

export const api = {
  uploadRecording: async (email: string, audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('email', email);
    formData.append('audio', audioBlob, 'recording.webm');

    const response = await fetch('/api/recordings', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Upload failed');
    }

    return response.json();
  },

  getUserStatus: async (email: string) => {
    const response = await fetch(`/api/status?email=${encodeURIComponent(email)}`);
    if (!response.ok) {
      throw new Error('Failed to get status');
    }
    return response.json();
  },

  getLeaderboard: async () => {
    const response = await fetch('/api/leaderboard');
    if (!response.ok) {
      throw new Error('Failed to get leaderboard');
    }
    return response.json();
  },

  getPortalStatus: async () => {
    const response = await fetch('/api/portal-status');
    if (!response.ok) {
      throw new Error('Failed to get portal status');
    }
    return response.json();
  },

  getAllRecordings: async () => {
    const response = await fetch('/api/recordings');
    if (!response.ok) {
      throw new Error('Failed to get recordings');
    }
    return response.json();
  },

  closeAuditionPortal: async () => {
    const response = await apiRequest('POST', '/api/close_audition');
    return response.json();
  }
};
