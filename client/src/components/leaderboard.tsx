import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Recording } from "@shared/schema";
import { Button } from "@/components/ui/button";

export function Leaderboard() {
  const { data: leaderboardData, isLoading, refetch } = useQuery({
    queryKey: ['/api/leaderboard'],
    queryFn: api.getLeaderboard,
  });

  const getInitials = (email: string) => {
    const parts = email.split('@')[0].split(/[._-]/);
    return parts.map(part => part.charAt(0).toUpperCase()).join('').slice(0, 2);
  };

  const getRankIcon = (index: number) => {
    if (index === 0) {
      return (
        <div className="w-8 h-8 bg-warning rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-warning-foreground" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
          </svg>
        </div>
      );
    }
    return null;
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { class: string; text: string }> = {
      pending: { class: 'bg-warning/10 text-warning', text: 'Pending' },
      under_review: { class: 'bg-primary/10 text-primary', text: 'Under Review' },
      scored: { class: 'bg-success/10 text-success', text: 'Scored' },
      closed: { class: 'bg-muted text-muted-foreground', text: 'Closed' }
    };
    
    const config = statusMap[status] || statusMap.pending;
    return (
      <span className={`px-3 py-1 text-xs font-medium rounded-full ${config.class}`}>
        {config.text}
      </span>
    );
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border p-8">
        <div className="text-center text-muted-foreground">Loading leaderboard...</div>
      </div>
    );
  }

  const leaderboard = leaderboardData?.leaderboard || [];

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Leaderboard</h3>
          <p className="text-sm text-muted-foreground mt-1">See how you rank among all contestants</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="flex items-center space-x-2"
          data-testid="button-refresh-leaderboard"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          <span>Refresh</span>
        </Button>
      </div>
      
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rank</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contestant</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leaderboard.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                  No submissions scored yet
                </td>
              </tr>
            ) : (
              leaderboard.map((recording: Recording, index: number) => (
                <tr 
                  key={recording.id} 
                  className={`hover:bg-muted/30 transition-colors ${index === 0 ? 'bg-accent/30' : ''}`}
                  data-testid={`row-leaderboard-${index}`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      {getRankIcon(index)}
                      <span className="text-2xl font-bold text-foreground">{index + 1}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-primary font-semibold" data-testid={`text-initials-${index}`}>
                          {getInitials(recording.email)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground" data-testid={`text-email-${index}`}>
                          {recording.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Submitted {formatTime(recording.created_at.toString())}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(recording.status)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span 
                      className={`text-xl font-bold ${recording.ai_score !== null ? (index === 0 ? 'text-success' : 'text-foreground') : 'text-muted-foreground'}`}
                      data-testid={`text-score-${index}`}
                    >
                      {recording.ai_score !== null ? recording.ai_score : '--'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {leaderboard.length > 0 && (
        <div className="p-4 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing <span className="font-medium text-foreground">{leaderboard.length}</span> contestants
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
