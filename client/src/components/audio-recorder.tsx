import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function AudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      if (!user) throw new Error('User not authenticated');
      return api.uploadRecording(user.email, blob);
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Your recording has been submitted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leaderboard'] });
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: Blob[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        
        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      toast({
        title: "Recording Failed",
        description: "Unable to access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const reRecord = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
  }, [audioUrl]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const submitRecording = useCallback(() => {
    if (audioBlob) {
      uploadMutation.mutate(audioBlob);
    }
  }, [audioBlob, uploadMutation]);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
      <div className="p-6 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">Record Your Audition</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Click the record button to start. You can re-record as many times as needed.
        </p>
      </div>
      
      <div className="p-8">
        {/* Recording Visualizer */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <Button
              size="lg"
              className="w-24 h-24 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-transform"
              onClick={isRecording ? stopRecording : startRecording}
              data-testid="button-record"
            >
              {isRecording ? (
                <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd"></path>
                </svg>
              ) : (
                <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path>
                </svg>
              )}
            </Button>
            
            {isRecording && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-destructive rounded-full recording-pulse">
                <span className="absolute inset-0 bg-destructive rounded-full animate-ping"></span>
              </div>
            )}
          </div>
        </div>

        {/* Wave Animation */}
        {isRecording && (
          <div className="flex justify-center items-center space-x-1 h-16 mb-6">
            {[...Array(9)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-primary rounded-full wave-animation"
                style={{ 
                  height: `${20 + (i % 3) * 20}%`, 
                  animationDelay: `${i * 0.1}s` 
                }}
              />
            ))}
          </div>
        )}

        {/* Timer Display */}
        <div className="text-center mb-6">
          <div className="text-4xl font-bold text-foreground font-mono" data-testid="text-recording-time">
            {formatTime(recordingTime)}
          </div>
          <p className="text-sm text-muted-foreground mt-1">Recording Duration</p>
        </div>

        {/* Control Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="secondary"
            onClick={reRecord}
            className="flex items-center justify-center space-x-2"
            data-testid="button-rerecord"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            <span>Re-record</span>
          </Button>
        </div>

        {/* Audio Preview */}
        {audioUrl && (
          <div className="mt-6 p-4 bg-accent rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-accent-foreground">Your Recording</span>
              <span className="text-xs text-muted-foreground">Ready to submit</span>
            </div>
            <audio controls className="w-full" src={audioUrl} data-testid="audio-preview" />
          </div>
        )}

        {/* Submit Button */}
        <div className="mt-6">
          <Button
            className="w-full py-4 font-semibold shadow-md flex items-center justify-center space-x-2"
            onClick={submitRecording}
            disabled={!audioBlob || uploadMutation.isPending}
            data-testid="button-submit-recording"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
            </svg>
            <span>{uploadMutation.isPending ? 'Uploading...' : 'Submit Recording'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
