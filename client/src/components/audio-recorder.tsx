// components/AudioRecorder.tsx
import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

export function AudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null); // use number for browser setInterval
  const streamRef = useRef<MediaStream | null>(null);

  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Ensure timers/streams cleaned up on unmount
  useEffect(() => {
    return () => {
      // stop media recorder if still active
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const uploadMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      if (!user) throw new Error("User not authenticated");
      return api.uploadRecording(user.email, blob);
    },
    onSuccess: (data) => {
      const recording = data.recording;
      toast({
        title: "Uploaded",
        description: "Your recording was uploaded. AI will evaluate it shortly.",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });

      // Fire-and-forget poll for ai result (do not block)
      (async () => {
        try {
          const final = await api.waitForAiResult(recording.id, { interval: 2000, timeout: 180000 });
          toast({
            title: "Evaluation complete",
            description: `Your recording was scored: ${final.ai_score}`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/status"] });
          queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
        } catch (err: any) {
          toast({
            title: "Evaluation error",
            description: err?.message ?? "AI evaluation failed or timed out",
            variant: "destructive",
          });
        }
      })();

      // reset UI
      setAudioBlob(null);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      setRecordingTime(0);
    },
    onError: (err: any) => {
      toast({
        title: "Upload failed",
        description: err?.message ?? "Upload failed",
        variant: "destructive",
      });
    },
  });

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up MediaRecorder and handlers before starting
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      mediaRecorder.onstop = () => {
        // create blob and URL
        const blob = new Blob(chunks, { type: "audio/webm" });
        setAudioBlob(blob);

        // revoke old URL if any
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // stop stream tracks if still active
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        // clear timer (defensive - also cleared on stopRecording)
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }

        setIsRecording(false);
      };

      // start recording AFTER handlers set
      mediaRecorder.start();

      // start timer using window.setInterval (returns number in browsers)
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      setIsRecording(true);
      setRecordingTime(0);
    } catch (err) {
      console.error("startRecording error", err);
      toast({
        title: "Recording failed",
        description: "Unable to access microphone. Check permissions.",
        variant: "destructive",
      });
    }
  }, [toast, audioUrl]);

  const stopRecording = useCallback(() => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } catch (err) {
      console.warn("stopRecording error:", err);
      // still attempt to cleanup
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (mediaRecorderRef.current) {
        try { mediaRecorderRef.current = null; } catch {}
      }
      setIsRecording(false);
    } finally {
      // clear timer if any (defensive)
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []);

  const reRecord = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioBlob(null);
    setRecordingTime(0);
  }, [audioUrl]);

  const submitRecording = useCallback(() => {
    if (!audioBlob) {
      toast({ title: "No recording", description: "Please record before submitting.", variant: "destructive" });
      return;
    }
    uploadMutation.mutate(audioBlob);
  }, [audioBlob, uploadMutation, toast]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
      <div className="p-6 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">Record Your Audition</h3>
        <p className="text-sm text-muted-foreground mt-1">Click the record button to start. You can re-record as many times as needed.</p>
      </div>

      <div className="p-8">
        <div className="flex justify-center mb-8">
          <div className="relative">
            <Button size="lg" className="w-24 h-24 rounded-full" onClick={isRecording ? stopRecording : startRecording}>
              {isRecording ? "Stop" : "Record"}
            </Button>
          </div>
        </div>

        <div className="text-center mb-6">
          <div className="text-4xl font-bold text-foreground font-mono">{formatTime(recordingTime)}</div>
          <p className="text-sm text-muted-foreground mt-1">Recording Duration</p>
        </div>

        <div className="flex gap-3 justify-center mb-6">
          <Button variant="secondary" onClick={reRecord} disabled={isRecording || !audioBlob}>Re-record</Button>
          <Button onClick={submitRecording} disabled={!audioBlob || uploadMutation.isPending}>
            {uploadMutation.isPending ? "Uploading..." : "Submit Recording"}
          </Button>
        </div>

        {audioUrl && (
          <div className="mt-6 p-4 bg-accent rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-accent-foreground">Your Recording</span>
              <span className="text-xs text-muted-foreground">Ready to submit</span>
            </div>
            <audio controls className="w-full" src={audioUrl} />
          </div>
        )}
      </div>
    </div>
  );
}
