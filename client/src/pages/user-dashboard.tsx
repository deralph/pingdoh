import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Navbar } from "@/components/navbar";
import { AudioRecorder } from "@/components/audio-recorder";
import { Leaderboard } from "@/components/leaderboard";

export default function UserDashboard() {
  const { user } = useAuth();
  
  const { data: statusData } = useQuery({
    queryKey: ['/api/status', user?.email],
    queryFn: () => user ? api.getUserStatus(user.email) : null,
    enabled: !!user,
  });

  const { data: portalStatus } = useQuery({
    queryKey: ['/api/portal-status'],
    queryFn: api.getPortalStatus,
  });

  const getStatusDisplay = (): { text: string; class: string } => {
    if (!statusData?.recording) return { text: "No submission", class: "bg-muted text-muted-foreground" };
    
    const statusMap: Record<string, { text: string; class: string }> = {
      pending: { text: "Pending", class: "bg-warning/10 text-warning" },
      under_review: { text: "Under Review", class: "bg-primary/10 text-primary" },
      scored: { text: "Scored", class: "bg-success/10 text-success" },
      closed: { text: "Closed", class: "bg-muted text-muted-foreground" }
    };
    
    return statusMap[statusData.recording.status] || statusMap.pending;
  };

  const statusDisplay = getStatusDisplay();
  const hasSubmitted = statusData?.has_submitted;
  const isPortalClosed = portalStatus && !portalStatus.is_open;
  const userScore = statusData?.recording?.ai_score;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-primary/10 to-accent rounded-xl p-6 border border-border mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to Your Audition Portal</h2>
          <p className="text-muted-foreground">Record your audition, submit it, and track your progress on the leaderboard.</p>
        </div>

        {/* Status Alert */}
        {isPortalClosed && (
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 flex items-start space-x-3 mb-6">
            <svg className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path>
            </svg>
            <div>
              <h3 className="font-semibold text-warning">Audition Portal Closed</h3>
              <p className="text-sm text-warning/80 mt-1">The audition submission period has ended. Check the leaderboard to see final results.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recording Section */}
          <div className="lg:col-span-2 space-y-6">
            {!hasSubmitted && !isPortalClosed ? (
              <AudioRecorder />
            ) : (
              <div className="bg-card rounded-xl shadow-sm border border-border p-8 text-center">
                <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-success" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Recording Submitted!</h3>
                <p className="text-muted-foreground">
                  {isPortalClosed 
                    ? "The audition portal has been closed. Results are final."
                    : "Your audition has been submitted and is under review."
                  }
                </p>
              </div>
            )}

            {/* Instructions Card */}
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center space-x-2">
                <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                </svg>
                <span>Recording Tips</span>
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start space-x-2">
                  <svg className="w-4 h-4 text-success mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                  </svg>
                  <span>Find a quiet space with minimal background noise</span>
                </li>
                <li className="flex items-start space-x-2">
                  <svg className="w-4 h-4 text-success mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                  </svg>
                  <span>Keep your microphone at a consistent distance</span>
                </li>
                <li className="flex items-start space-x-2">
                  <svg className="w-4 h-4 text-success mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                  </svg>
                  <span>Speak clearly and at a natural pace</span>
                </li>
                <li className="flex items-start space-x-2">
                  <svg className="w-4 h-4 text-success mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                  </svg>
                  <span>Review your recording before submitting</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Status Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Submission Status Card */}
            <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
              <div className="p-4 bg-primary/5 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Your Status</h3>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-muted-foreground">Audition Status:</span>
                  <span 
                    className={`px-3 py-1 text-xs font-medium rounded-full ${statusDisplay.class || 'bg-muted text-muted-foreground'}`}
                    data-testid="text-user-status"
                  >
                    {statusDisplay.text || "No submission"}
                  </span>
                </div>
                
                {/* Score Display */}
                {userScore !== null && userScore !== undefined && (
                  <div className="mt-4 p-4 bg-accent rounded-lg text-center">
                    <p className="text-xs text-muted-foreground mb-1">AI Score</p>
                    <p className="text-4xl font-bold text-accent-foreground" data-testid="text-user-score">
                      {userScore}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">out of 100</p>
                  </div>
                )}

                {/* Status Timeline */}
                {hasSubmitted && (
                  <div className="mt-6 space-y-3">
                    <div className="flex items-start space-x-3">
                      <div className="w-6 h-6 rounded-full bg-success flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-success-foreground" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">Submitted</p>
                        <p className="text-xs text-muted-foreground">Recording uploaded successfully</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${statusData?.recording?.status === 'scored' ? 'bg-success' : 'bg-muted'}`}>
                        {statusData?.recording?.status === 'scored' ? (
                          <svg className="w-4 h-4 text-success-foreground" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                          </svg>
                        ) : (
                          <div className="w-2 h-2 bg-muted-foreground rounded-full"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${statusData?.recording?.status === 'scored' ? 'text-foreground' : 'text-muted-foreground'}`}>
                          Scored
                        </p>
                        <p className="text-xs text-muted-foreground">AI evaluation complete</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="mt-8">
          <Leaderboard />
        </div>
      </div>
    </div>
  );
}
