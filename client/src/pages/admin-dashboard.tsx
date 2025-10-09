// AdminDashboard.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Recording, AiFileScore } from "@/lib/api";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export default function AdminDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recordingsData, isLoading } = useQuery({
    queryKey: ["/api/recordings"],
    queryFn: api.getAllRecordings,
  });

  const { data: portalStatus } = useQuery({
    queryKey: ["/api/portal-status"],
    queryFn: api.getPortalStatus,
  });

  const closePortalMutation = useMutation({
    mutationFn: api.closeAuditionPortal,
    onSuccess: () => {
      toast({
        title: "Portal Closed",
        description:
          "Audition portal has been closed and AI scoring is complete.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/portal-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/recordings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
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
    const matchesSearch = recording.email
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || recording.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: recordings.length,
    scored: recordings.filter((r: Recording) => r.ai_score !== null).length,
    pending: recordings.filter((r: Recording) => r.ai_score === null).length,
    averageScore:
      recordings
        .filter((r: Recording) => r.ai_score !== null)
        .reduce((sum: number, r: Recording) => sum + (r.ai_score || 0), 0) /
      Math.max(
        1,
        recordings.filter((r: Recording) => r.ai_score !== null).length
      ),
  };

  const getInitials = (email: string) => {
    const parts = email.split("@")[0].split(/[._-]/);
    return parts
      .map((p) => p.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2);
  };

  const statusMap: Record<string, { class: string; text: string }> = {
    pending: { class: "bg-warning/10 text-warning", text: "Pending" },
    under_review: { class: "bg-primary/10 text-primary", text: "Under Review" },
    scored: { class: "bg-success/10 text-success", text: "Scored" },
    closed: { class: "bg-muted text-muted-foreground", text: "Closed" },
  };

  const formatDate = (date: string | Date) =>
    new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleClosePortal = () => closePortalMutation.mutate();
  const isPortalOpen = portalStatus?.is_open !== false;

  // Toggle expand panel
  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-destructive/10 to-primary/10 rounded-xl p-6 border border-border mb-6">
          <div className="flex flex-wrap items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                Admin Dashboard
              </h2>
              <p className="text-muted-foreground">
                Manage audition submissions and portal status
              </p>
            </div>

            {isPortalOpen && (
              <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
                <DialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="lg"
                    className="shadow-md font-semibold"
                  >
                    Close Audition Portal
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Close Audition Portal?</DialogTitle>
                    <DialogDescription>
                      Closing will prevent further submissions and trigger AI
                      scoring for all submissions.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowCloseDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleClosePortal}
                      disabled={closePortalMutation.isPending}
                    >
                      {closePortalMutation.isPending
                        ? "Closing..."
                        : "Yes, Close Portal"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Total Submissions</p>
            <p className="text-3xl font-bold mt-2">{stats.total}</p>
          </div>
          <div className="bg-card rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Scored</p>
            <p className="text-3xl font-bold text-success mt-2">
              {stats.scored}
            </p>
          </div>
          <div className="bg-card rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-3xl font-bold text-warning mt-2">
              {stats.pending}
            </p>
          </div>
          <div className="bg-card rounded-lg p-5">
            <p className="text-sm text-muted-foreground">Avg Score</p>
            <p className="text-3xl font-bold mt-2">
              {stats.scored > 0
                ? Math.round(stats.averageScore * 10) / 10
                : "--"}
            </p>
          </div>
        </div>

        {/* Submissions table */}
        <div className="bg-card rounded-xl overflow-hidden border border-border">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">All Submissions</h3>
              <p className="text-sm text-muted-foreground mt-1">
                View and manage contestant recordings
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <Input
                placeholder="Search by email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="scored">Scored</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground">
                    Contestant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground">
                    Submitted At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground">
                    Recording
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground">
                    AI Score
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-8 text-center text-muted-foreground"
                    >
                      Loading submissions...
                    </td>
                  </tr>
                ) : filteredRecordings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-8 text-center text-muted-foreground"
                    >
                      No submissions
                    </td>
                  </tr>
                ) : (
                  filteredRecordings.map(
                    (recording: Recording, idx: number) => {
                      const statusCfg =
                        statusMap[recording.status] || statusMap.pending;
                      const expanded = expandedId === recording.id;

                      return (
                        <tbody key={recording.id}>
                          <tr className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                                  <span className="text-primary font-semibold">
                                    {getInitials(recording.email)}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">
                                    {recording.email}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    ID: {recording.id.slice(0, 8)}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-4 text-sm text-muted-foreground">
                              {formatDate(recording.created_at)}
                            </td>

                            <td className="px-6 py-4">
                              {/* Inline audio player */}
                              <audio
                                controls
                                preload="none"
                                src={recording.audio_url}
                                className="w-64"
                              />
                            </td>

                            <td className="px-6 py-4">
                              <span
                                className={`px-3 py-1 text-xs font-medium rounded-full ${statusCfg.class}`}
                              >
                                {statusCfg.text}
                              </span>
                            </td>

                            <td className="px-6 py-4 text-center">
                              <span
                                className={`text-2xl font-bold ${
                                  recording.ai_score !== null
                                    ? "text-foreground"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {recording.ai_score !== null
                                  ? recording.ai_score
                                  : "--"}
                              </span>
                            </td>

                            <td className="px-6 py-4 text-center">
                              <Button
                                size="sm"
                                onClick={() => toggleExpand(recording.id)}
                              >
                                {expanded ? "Hide" : "Details"}
                              </Button>
                            </td>
                          </tr>

                          {/* Expanded details row */}
                          {expanded && (
                            <tr>
                              <td colSpan={6} className="bg-muted/5 p-4">
                                <div className="space-y-4">
                                  <div>
                                    <h4 className="text-sm font-semibold mb-2">
                                      AI Evaluation
                                    </h4>
                                    {recording.ai_result ? (
                                      <>
                                        <p className="text-xs text-muted-foreground mb-2">
                                          Status:{" "}
                                          {String(recording.ai_result.status)}
                                        </p>
                                        {Array.isArray(
                                          recording.ai_result.results
                                        ) &&
                                        recording.ai_result.results.length >
                                          0 ? (
                                          <div className="overflow-auto border rounded">
                                            <table className="w-full text-sm">
                                              <thead className="bg-muted/30">
                                                <tr>
                                                  <th className="px-3 py-2 text-left">
                                                    File
                                                  </th>
                                                  <th className="px-3 py-2 text-center">
                                                    Pitch
                                                  </th>
                                                  <th className="px-3 py-2 text-center">
                                                    Rhythm
                                                  </th>
                                                  <th className="px-3 py-2 text-center">
                                                    Tone
                                                  </th>
                                                  <th className="px-3 py-2 text-center">
                                                    Expression
                                                  </th>
                                                  <th className="px-3 py-2 text-center">
                                                    Consistency
                                                  </th>
                                                  <th className="px-3 py-2 text-center">
                                                    Final
                                                  </th>
                                                  <th className="px-3 py-2 text-center">
                                                    Rank
                                                  </th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {recording.ai_result.results!.map(
                                                  (
                                                    r: AiFileScore,
                                                    i: number
                                                  ) => (
                                                    <tr
                                                      key={i}
                                                      className="border-t"
                                                    >
                                                      <td className="px-3 py-2">
                                                        {r.filename}
                                                      </td>
                                                      <td className="px-3 py-2 text-center">
                                                        {(
                                                          r.pitch * 100
                                                        ).toFixed(0)}
                                                        %
                                                      </td>
                                                      <td className="px-3 py-2 text-center">
                                                        {(
                                                          r.rhythm * 100
                                                        ).toFixed(0)}
                                                        %
                                                      </td>
                                                      <td className="px-3 py-2 text-center">
                                                        {(r.tone * 100).toFixed(
                                                          0
                                                        )}
                                                        %
                                                      </td>
                                                      <td className="px-3 py-2 text-center">
                                                        {(
                                                          r.expression * 100
                                                        ).toFixed(0)}
                                                        %
                                                      </td>
                                                      <td className="px-3 py-2 text-center">
                                                        {(
                                                          r.consistency * 100
                                                        ).toFixed(0)}
                                                        %
                                                      </td>
                                                      <td className="px-3 py-2 text-center font-bold">
                                                        {(
                                                          r.final_score * 100
                                                        ).toFixed(1)}
                                                      </td>
                                                      <td className="px-3 py-2 text-center">
                                                        {r.rank ?? "--"}
                                                      </td>
                                                    </tr>
                                                  )
                                                )}
                                              </tbody>
                                            </table>
                                          </div>
                                        ) : (
                                          <p className="text-sm text-muted-foreground">
                                            No per-file results available.
                                          </p>
                                        )}

                                        {recording.ai_result.message && (
                                          <p className="text-xs text-muted-foreground mt-2">
                                            Message:{" "}
                                            {recording.ai_result.message}
                                          </p>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">
                                        AI result not available yet.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      );
                    }
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
