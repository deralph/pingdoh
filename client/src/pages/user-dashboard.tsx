// client/src/pages/user-dashboard.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api, Recording, AiFileScore } from "@/lib/api";
import { Navbar } from "@/components/navbar";
import { AudioRecorder } from "@/components/audio-recorder";
import { Leaderboard } from "@/components/leaderboard";

export default function UserDashboard(): JSX.Element {
  const { user } = useAuth();

  // Poll user's status frequently so reset from restart is visible quickly
  const { data: statusData } = useQuery({
    queryKey: ["/api/status", user?.email],
    queryFn: () => (user ? api.getUserStatus(user.email) : Promise.resolve(null)),
    enabled: !!user,
    refetchInterval: 3000, // poll every 3 seconds
  });

  // Poll portal status so portal open/close/restart is reflected quickly
  const { data: portalStatus } = useQuery({
    queryKey: ["/api/portal-status"],
    queryFn: api.getPortalStatus,
    refetchInterval: 3000, // poll every 3 seconds
  });

  const formatDate = (date: string | Date) =>
    new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const getStatusDisplay = (): { text: string; class: string } => {
    if (!statusData?.recording) return { text: "No submission", class: "bg-muted text-muted-foreground" };
    const map: Record<string, { text: string; class: string }> = {
      pending: { text: "Pending", class: "bg-warning/10 text-warning" },
      under_review: { text: "Under Review", class: "bg-primary/10 text-primary" },
      scored: { text: "Scored", class: "bg-success/10 text-success" },
      closed: { text: "Closed", class: "bg-muted text-muted-foreground" },
    };
    return map[statusData.recording.status] || map.pending;
  };

  const statusDisplay = getStatusDisplay();
  const hasSubmitted = statusData?.has_submitted;
  const isPortalClosed = portalStatus && !portalStatus.is_open;
  const recording: Recording | null = statusData?.recording ?? null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-gradient-to-r from-primary/10 to-accent rounded-xl p-6 border border-border mb-6">
          <h2 className="text-2xl font-bold">Welcome to Your Audition Portal</h2>
          <p className="text-muted-foreground">Record, submit and track your audition.</p>
        </div>

        {isPortalClosed && (
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 flex items-start space-x-3 mb-6">
            <svg className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path>
            </svg>
            <div>
              <h3 className="font-semibold text-warning">Audition Portal Closed</h3>
              <p className="text-sm text-warning/80 mt-1">The audition submission period has ended. Check the leaderboard for final results.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {!hasSubmitted && !isPortalClosed ? (
              <AudioRecorder />
            ) : (
              <div className="bg-card rounded-xl p-8 text-center">
                <h3 className="text-lg font-semibold mb-2">Recording Submitted</h3>
                <p className="text-muted-foreground">
                  {isPortalClosed ? "The audition portal is closed." : "Your audition is being processed."}
                </p>

                {recording && (
                  <div className="mt-6 space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Submitted at</p>
                      <p className="font-medium">{formatDate(recording.created_at)}</p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Your Recording</p>
                      <audio controls preload="none" src={recording.audio_url} className="w-full" />
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Status</p>
                      <span className={`px-3 py-1 rounded-full ${statusDisplay.class}`}>{statusDisplay.text}</span>
                    </div>

                    {recording.ai_score !== null && recording.ai_score !== undefined && (
                      <div className="mt-4 p-4 bg-accent rounded-lg">
                        <p className="text-xs text-muted-foreground">AI Score</p>
                        <p className="text-3xl font-bold">{Math.round(recording.ai_score)}%</p>
                        <p className="text-xs text-muted-foreground">out of 100</p>

                        {recording.ai_result && Array.isArray(recording.ai_result.results) && (
                          <div className="mt-4 border rounded overflow-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/30">
                                <tr>
                                  <th className="px-3 py-2 text-left">File</th>
                                  <th className="px-3 py-2 text-center">Pitch</th>
                                  <th className="px-3 py-2 text-center">Rhythm</th>
                                  <th className="px-3 py-2 text-center">Tone</th>
                                  <th className="px-3 py-2 text-center">Expression</th>
                                  <th className="px-3 py-2 text-center">Consistency</th>
                                  <th className="px-3 py-2 text-center">Final</th>
                                </tr>
                              </thead>
                              <tbody>
                                {recording.ai_result.results!.map((r: AiFileScore, i: number) => (
                                  <tr key={i} className="border-t">
                                    <td className="px-3 py-2">{r.filename}</td>
                                    <td className="px-3 py-2 text-center">{(r.pitch * 100).toFixed(0)}%</td>
                                    <td className="px-3 py-2 text-center">{(r.rhythm * 100).toFixed(0)}%</td>
                                    <td className="px-3 py-2 text-center">{(r.tone * 100).toFixed(0)}%</td>
                                    <td className="px-3 py-2 text-center">{(r.expression * 100).toFixed(0)}%</td>
                                    <td className="px-3 py-2 text-center">{(r.consistency * 100).toFixed(0)}%</td>
                                    <td className="px-3 py-2 text-center font-bold">{(r.final_score * 100).toFixed(1)}%</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Instructions card */}
            <div className="bg-card rounded-xl p-6 mt-6">
              <h3 className="text-lg font-semibold mb-4">Recording Tips</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>Find a quiet space with minimal background noise</li>
                <li>Keep your microphone at a consistent distance</li>
                <li>Speak/sing clearly at a natural pace</li>
                <li>Review your recording before submitting</li>
              </ul>
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <div className="bg-card rounded-xl p-6">
              <h3 className="text-sm font-semibold mb-2">Your Status</h3>
              {!statusData?.recording ? (
                <p className="text-sm text-muted-foreground">No submission yet</p>
              ) : (
                <>
                  <p className="text-sm mb-2">Status</p>
                  <div className={`px-3 py-2 rounded ${statusDisplay.class}`}>{statusDisplay.text}</div>
                  {recording?.ai_score !== null && recording?.ai_score !== undefined && (
                    <>
                      <p className="text-xs text-muted-foreground mt-4">AI Score</p>
                      <p className="text-2xl font-bold">{Math.round(recording.ai_score)}%</p>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="mt-6">
              {/* Only show leaderboard once the portal is closed */}
              {isPortalClosed ? <Leaderboard /> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
