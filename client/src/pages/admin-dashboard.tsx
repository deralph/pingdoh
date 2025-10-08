import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Recording } from "@shared/schema";

export default function AdminDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recordingsData, isLoading } = useQuery({
    queryKey: ['/api/recordings'],
    queryFn: api.getAllRecordings,
  });

  const { data: portalStatus } = useQuery({
    queryKey: ['/api/portal-status'],
    queryFn: api.getPortalStatus,
  });

  const closePortalMutation = useMutation({
    mutationFn: api.closeAuditionPortal,
    onSuccess: () => {
      toast({
        title: "Portal Closed",
        description: "Audition portal has been closed and AI scoring is complete.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/portal-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leaderboard'] });
      setShowCloseDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const recordings = recordingsData?.recordings || [];
  
  const filteredRecordings = recordings.filter((recording: Recording) => {
    const matchesSearch = recording.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || recording.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: recordings.length,
    scored: recordings.filter((r: Recording) => r.ai_score !== null).length,
    pending: recordings.filter((r: Recording) => r.ai_score === null).length,
    averageScore: recordings.filter((r: Recording) => r.ai_score !== null).reduce((sum: number, r: Recording) => sum + (r.ai_score || 0), 0) / Math.max(1, recordings.filter((r: Recording) => r.ai_score !== null).length)
  };

  const getInitials = (email: string) => {
    const parts = email.split('@')[0].split(/[._-]/);
    return parts.map(part => part.charAt(0).toUpperCase()).join('').slice(0, 2);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { class: string; text: string }> = {
      pending: { class: 'bg-warning/10 text-warning', text: 'Pending' },
      under_review: { class: 'bg-primary/10 text-primary', text: 'Under Review' },
      scored: { class: 'bg-success/10 text-success', text: 'Scored' },
      closed: { class: 'bg-muted text-muted-foreground', text: 'Closed' }
    };
    
    return statusMap[status] || statusMap.pending;
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleClosePortal = () => {
    closePortalMutation.mutate();
  };

  const isPortalOpen = portalStatus?.is_open !== false;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Admin Header */}
        <div className="bg-gradient-to-r from-destructive/10 to-primary/10 rounded-xl p-6 border border-border mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-foreground">Admin Dashboard</h2>
              </div>
              <p className="text-muted-foreground">Manage audition submissions and portal status</p>
            </div>
            
            {isPortalOpen && (
              <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
                <DialogTrigger asChild>
                  <Button 
                    variant="destructive"
                    size="lg"
                    className="shadow-md font-semibold flex items-center space-x-2"
                    data-testid="button-close-portal"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                    </svg>
                    <span>Close Audition Portal</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                        </svg>
                      </div>
                      Close Audition Portal?
                    </DialogTitle>
                    <DialogDescription asChild>
                      <div className="space-y-4">
                        <p>This action will:</p>
                        <ul className="space-y-2">
                          <li className="flex items-start space-x-2 text-sm">
                            <svg className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path>
                            </svg>
                            <span>Prevent any further submissions from users</span>
                          </li>
                          <li className="flex items-start space-x-2 text-sm">
                            <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                            </svg>
                            <span>Automatically trigger AI scoring for all submissions</span>
                          </li>
                          <li className="flex items-start space-x-2 text-sm">
                            <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                            </svg>
                            <span>Finalize the leaderboard with rankings</span>
                          </li>
                        </ul>
                        <p className="text-sm text-destructive font-medium">This action cannot be undone.</p>
                      </div>
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowCloseDialog(false)}
                      data-testid="button-cancel-close"
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={handleClosePortal}
                      disabled={closePortalMutation.isPending}
                      data-testid="button-confirm-close"
                    >
                      {closePortalMutation.isPending ? 'Closing...' : 'Yes, Close Portal'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Portal Status Alert */}
        <div className={`border rounded-lg p-4 flex items-start space-x-3 mb-6 ${
          isPortalOpen 
            ? 'bg-success/10 border-success/20' 
            : 'bg-warning/10 border-warning/20'
        }`}>
          <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
            isPortalOpen ? 'text-success' : 'text-warning'
          }`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
          </svg>
          <div>
            <h3 className={`font-semibold ${isPortalOpen ? 'text-success' : 'text-warning'}`}>
              {isPortalOpen ? 'Portal Currently Open' : 'Portal Closed'}
            </h3>
            <p className={`text-sm mt-1 ${isPortalOpen ? 'text-success/80' : 'text-warning/80'}`}>
              {isPortalOpen 
                ? 'Users can submit recordings. Close the portal to trigger AI scoring and finalize the leaderboard.'
                : 'The audition portal is closed. AI scoring has been completed and results are final.'
              }
            </p>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card rounded-lg shadow-sm border border-border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Submissions</p>
                <p className="text-3xl font-bold text-foreground mt-2" data-testid="text-total-submissions">
                  {stats.total}
                </p>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-primary" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"></path>
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"></path>
                </svg>
              </div>
            </div>
          </div>
          
          <div className="bg-card rounded-lg shadow-sm border border-border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Scored</p>
                <p className="text-3xl font-bold text-success mt-2" data-testid="text-scored-count">
                  {stats.scored}
                </p>
              </div>
              <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-success" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                </svg>
              </div>
            </div>
          </div>
          
          <div className="bg-card rounded-lg shadow-sm border border-border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-3xl font-bold text-warning mt-2" data-testid="text-pending-count">
                  {stats.pending}
                </p>
              </div>
              <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-warning" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"></path>
                </svg>
              </div>
            </div>
          </div>
          
          <div className="bg-card rounded-lg shadow-sm border border-border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Score</p>
                <p className="text-3xl font-bold text-accent-foreground mt-2" data-testid="text-average-score">
                  {stats.scored > 0 ? Math.round(stats.averageScore * 10) / 10 : '--'}
                </p>
              </div>
              <div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-accent-foreground" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"></path>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Submissions Table */}
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">All Submissions</h3>
              <p className="text-sm text-muted-foreground mt-1">View and manage contestant recordings</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search by email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
                <svg className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="scored">Scored</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contestant</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Submitted At</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recording</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      Loading submissions...
                    </td>
                  </tr>
                ) : filteredRecordings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      {searchTerm || statusFilter !== "all" ? "No submissions match your filters" : "No submissions yet"}
                    </td>
                  </tr>
                ) : (
                  filteredRecordings.map((recording: Recording, index: number) => {
                    const statusConfig = getStatusBadge(recording.status);
                    
                    return (
                      <tr key={recording.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-submission-${index}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                              <span className="text-primary font-semibold">
                                {getInitials(recording.email)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-foreground" data-testid={`text-email-${index}`}>
                                {recording.email}
                              </p>
                              <p className="text-xs text-muted-foreground">ID: {recording.id.slice(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {formatDate(recording.created_at)}
                        </td>
                        <td className="px-6 py-4">
                          <a 
                            href={recording.audio_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center space-x-2 text-primary hover:text-primary/80 transition-colors"
                            data-testid={`link-audio-${index}`}
                          >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path>
                            </svg>
                            <span className="text-sm">Play Audio</span>
                          </a>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 text-xs font-medium rounded-full ${statusConfig.class}`}>
                            {statusConfig.text}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span 
                            className={`text-2xl font-bold ${recording.ai_score !== null ? 'text-foreground' : 'text-muted-foreground'}`}
                            data-testid={`text-score-${index}`}
                          >
                            {recording.ai_score !== null ? recording.ai_score : '--'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredRecordings.length > 0 && (
            <div className="p-4 border-t border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{filteredRecordings.length}</span> of{' '}
                  <span className="font-medium text-foreground">{recordings.length}</span> submissions
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
