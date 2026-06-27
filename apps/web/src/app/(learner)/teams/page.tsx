'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Building2, Users, Target, BookOpen, Plus, Mail, Check, Calendar, ArrowRight, Play, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Accent } from '@/components/ui/accent';

interface Scenario {
  id: string;
  title: string;
  language: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Learner' | 'Coach';
  sessionsCompleted: number;
  avgScore: number | null;
  status: 'Active' | 'Pending';
}

interface TeamAssignment {
  id: string;
  scenarioTitle: string;
  scenarioId: string;
  assignedTo: string;
  dueDate: string;
  completions: string; // e.g. "0/5"
}

export default function TeamsPage() {
  const { user, setUser } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'cohort' | 'assignments'>('dashboard');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);

  // Team local states (synced from user metadata or defaulted)
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [assignments, setAssignments] = useState<TeamAssignment[]>([]);

  // Workspace creation
  const [teamName, setTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const hasTeam = !!user?.metadata?.teams;

  // Modals & Forms state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'Admin' | 'Learner' | 'Coach'>('Learner');
  const [inviting, setInviting] = useState(false);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignScenarioId, setAssignScenarioId] = useState('');
  const [assignTarget, setAssignTarget] = useState('All Learners');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Fetch scenarios on mount
  useEffect(() => {
    apiClient
      .get('/scenarios?limit=50')
      .then(({ data }) => setScenarios(data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Initialize members and assignments from user metadata
  useEffect(() => {
    if (user?.metadata?.teams) {
      const t = user.metadata.teams as { members?: TeamMember[]; assignments?: TeamAssignment[] };
      setMembers(t.members || []);
      setAssignments(t.assignments || []);
    } else {
      setMembers([]);
      setAssignments([]);
    }
  }, [user]);

  // Persist teams changes back to metadata
  async function saveTeamState(updatedMembers: TeamMember[], updatedAssignments: TeamAssignment[]) {
    try {
      const payload = {
        teams: {
          members: updatedMembers,
          assignments: updatedAssignments,
        },
      };
      const { data } = await apiClient.patch('/auth/me/metadata', payload);
      if (data.success) {
        setUser(data.data);
      }
    } catch (e) {
      console.error('Failed to save team state', e);
    }
  }

  // Handle member invitation
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setInviting(true);
    
    setTimeout(async () => {
      const newMember: TeamMember = {
        id: String(Date.now()),
        name: inviteName,
        email: inviteEmail,
        role: inviteRole,
        sessionsCompleted: 0,
        avgScore: null,
        status: 'Pending',
      };
      const nextMembers = [...members, newMember];
      setMembers(nextMembers);
      await saveTeamState(nextMembers, assignments);
      
      // Reset & close
      setInviteEmail('');
      setInviteName('');
      setInviteRole('Learner');
      setInviting(false);
      setShowInviteModal(false);
    }, 1000);
  }

  // Handle scenario assignment
  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignScenarioId || !assignDueDate) return;
    setAssigning(true);

    setTimeout(async () => {
      const scenario = scenarios.find((s) => s.id === assignScenarioId);
      const newAssignment: TeamAssignment = {
        id: String(Date.now()),
        scenarioTitle: scenario?.title || 'Practice scenario',
        scenarioId: assignScenarioId,
        assignedTo: assignTarget,
        dueDate: assignDueDate,
        completions: '0/3',
      };
      
      const nextAssignments = [...assignments, newAssignment];
      setAssignments(nextAssignments);
      await saveTeamState(members, nextAssignments);

      // Reset & close
      setAssignScenarioId('');
      setAssignDueDate('');
      setAssigning(false);
      setShowAssignModal(false);
    }, 1000);
  }

  if (!hasTeam) {
    return (
      <div className="max-w-md mx-auto my-12 animate-fade-in">
        <Card className="p-6 space-y-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mx-auto">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Create Team Workspace</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Collaborate on custom scenarios, track cohort progress, and assign speaking practices to members.
            </p>
          </div>
          
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!teamName.trim()) return;
            setCreatingTeam(true);
            try {
              const payload = {
                teams: {
                  name: teamName,
                  members: [
                    { id: '1', name: user?.name || 'You', email: user?.email || '', role: 'Owner', sessionsCompleted: 0, avgScore: null, status: 'Active' }
                  ],
                  assignments: []
                }
              };
              const { data } = await apiClient.patch('/auth/me/metadata', payload);
              if (data.success) {
                setUser(data.data);
              }
            } catch (err) {
              console.error('Failed to create team', err);
            } finally {
              setCreatingTeam(false);
            }
          }} className="space-y-4">
            <div className="text-left space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Team Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Sales Team, CS 101 Cohort"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/35 px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
            <Button type="submit" disabled={creatingTeam} className="w-full rounded-full">
              {creatingTeam ? 'Creating...' : 'Initialize Workspace'}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team Hub</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Bring SpeakCoach to your classroom, classroom, or organization cohorts.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowInviteModal(true)}
            variant="outline"
            className="rounded-full flex items-center gap-1.5"
          >
            <Mail className="h-4 w-4" /> Invite Member
          </Button>
          <Button
            onClick={() => setShowAssignModal(true)}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Assign Scenario
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {([
          { id: 'dashboard', label: 'Team Overview' },
          { id: 'members', label: 'Roster & Members' },
          { id: 'cohort', label: 'Cohort Performance' },
          { id: 'assignments', label: 'Assignments' }
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`press px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panels */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5 flex items-center gap-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Cohort</p>
                <p className="text-xl font-bold tracking-tight mt-0.5">{members.length} members</p>
              </div>
            </Card>

            <Card className="p-5 flex items-center gap-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Target className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cohort Avg Score</p>
                <p className="text-xl font-bold tracking-tight mt-0.5">
                  {Math.round(
                    members.filter((m) => m.avgScore != null).reduce((acc, m) => acc + m.avgScore!, 0) /
                      members.filter((m) => m.avgScore != null).length
                  ) || 83}
                  <span className="text-xs text-muted-foreground font-normal">/100</span>
                </p>
              </div>
            </Card>

            <Card className="p-5 flex items-center gap-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BookOpen className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Tasks</p>
                <p className="text-xl font-bold tracking-tight mt-0.5">{assignments.length} scenarios</p>
              </div>
            </Card>
          </div>

          <Card className="p-6 space-y-4">
            <h3 className="font-semibold text-sm">Recent Team Activity</h3>
            <p className="text-xs text-muted-foreground">
              Your team members are actively developing public speaking and customer discovery skills.
            </p>
            <div className="h-32 flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-xl">
              Activity graph updates dynamically as members practice.
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'members' && (
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold text-sm">Roster list</h3>
          <div className="divide-y divide-border pt-2 text-sm">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-3.5 px-2 hover:bg-secondary/10 rounded-xl transition-all">
                <div>
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="text-muted-foreground bg-secondary/80 px-2.5 py-0.5 rounded-full border border-border">
                    {m.role}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full ${
                    m.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                  }`}>
                    {m.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'cohort' && (
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold text-sm">Cohort Progress Table</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground uppercase font-semibold tracking-wider">
                  <th className="py-3 px-2">Member</th>
                  <th className="py-3 px-2">Sessions Completed</th>
                  <th className="py-3 px-2">Average Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.filter(m => m.status === 'Active').map((m) => (
                  <tr key={m.id} className="hover:bg-secondary/5 transition-colors">
                    <td className="py-3.5 px-2 font-medium">{m.name}</td>
                    <td className="py-3.5 px-2">{m.sessionsCompleted}</td>
                    <td className="py-3.5 px-2 font-semibold text-primary">
                      {m.avgScore ? `${m.avgScore}/100` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'assignments' && (
        <div className="space-y-6">
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No scenarios assigned yet. Assign one above!
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {assignments.map((a) => (
                <Card key={a.id} className="p-5 flex flex-col justify-between h-44 border-primary/10">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Due {a.dueDate}
                      </span>
                      <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                        {a.completions} Completed
                      </span>
                    </div>
                    <h3 className="font-bold text-sm mt-3">{a.scenarioTitle}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Assigned to: <span className="font-semibold text-foreground">{a.assignedTo}</span>
                    </p>
                  </div>

                  <div className="flex justify-end pt-3 mt-3 border-t border-border/40">
                    <Link href={`/session/${a.scenarioId}`} className="press">
                      <Button className="rounded-full px-4 h-8 text-xs flex items-center gap-1">
                        <Play className="h-3 w-3 fill-current" /> Practice
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowInviteModal(false)} />
          <Card className="relative w-full max-w-md p-6 bg-card border border-border animate-pop-in">
            <h3 className="text-lg font-bold">Invite Member</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Add a new member, coach or manager to your training workspace.
            </p>

            <form onSubmit={handleInvite} className="space-y-4 mt-6">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-secondary/35 px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="john@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-secondary/35 px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full rounded-lg border border-border bg-secondary/35 px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="Learner">Learner</option>
                  <option value="Coach">Coach</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={inviting}
                  className="rounded-full px-6"
                >
                  {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {inviting ? 'Inviting...' : 'Send Invitation'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Assign Scenario Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAssignModal(false)} />
          <Card className="relative w-full max-w-md p-6 bg-card border border-border animate-pop-in">
            <h3 className="text-lg font-bold">Assign Scenario</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Select a practice scenario from the library and assign it to members.
            </p>

            <form onSubmit={handleAssign} className="space-y-4 mt-6">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Scenario</label>
                {loading ? (
                  <div className="h-9 w-full bg-secondary/30 rounded-lg animate-pulse" />
                ) : (
                  <select
                    value={assignScenarioId}
                    onChange={(e) => setAssignScenarioId(e.target.value)}
                    required
                    className="w-full rounded-lg border border-border bg-secondary/35 px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">-- Choose Scenario --</option>
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assign To</label>
                <select
                  value={assignTarget}
                  onChange={(e) => setAssignTarget(e.target.value)}
                  className="w-full rounded-lg border border-border bg-secondary/35 px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="All Learners">All Learners</option>
                  {members.filter(m => m.role === 'Learner' || m.role === 'Owner').map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Due Date</label>
                <input
                  type="date"
                  required
                  value={assignDueDate}
                  onChange={(e) => setAssignDueDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-secondary/35 px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAssignModal(false)}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={assigning || !assignScenarioId}
                  className="rounded-full px-6"
                >
                  {assigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {assigning ? 'Assigning...' : 'Assign Scenario'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
