import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy,
  Users,
  Clock,
  Lock,
  Globe,
  Plus,
  Key,
  Search,
  CheckCircle2,
  AlertCircle,
  Play,
  ChevronRight,
} from 'lucide-react';
import {
  Competition,
  CompetitionStatus,
  CompetitionVisibility,
} from '@tradegrid/shared-types';
import { competitionApiService } from '../services/competition.service';
import { formatCurrency } from '../utils/formatters';

export const CompetitionsPage: React.FC = () => {
  const navigate = useNavigate();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [myCompetitions, setMyCompetitions] = useState<Competition[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | CompetitionStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [visibilityFilter, setVisibilityFilter] = useState<'ALL' | CompetitionVisibility>('ALL');
  const [showOnlyMine, setShowOnlyMine] = useState<boolean>(false);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isJoinCodeOpen, setIsJoinCodeOpen] = useState<boolean>(false);
  const [selectedCompForJoin, setSelectedCompForJoin] = useState<Competition | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form State for Create
  const [formName, setFormName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formVisibility, setFormVisibility] = useState<CompetitionVisibility>('PUBLIC');
  const [formJoinCode, setFormJoinCode] = useState<string>('');
  const [formCapital, setFormCapital] = useState<string>('100000');
  const [formMaxParticipants, setFormMaxParticipants] = useState<number>(100);
  const [formMinParticipants, setFormMinParticipants] = useState<number>(2);
  const [formStartTime, setFormStartTime] = useState<string>('');
  const [formEndTime, setFormEndTime] = useState<string>('');
  const [formAllowedInstruments, setFormAllowedInstruments] = useState<string>('ALPHA, BETA, TGRID, RELIANCE, TCS');
  const [formCreateError, setFormCreateError] = useState<string | null>(null);

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [listRes, myRes] = await Promise.all([
        competitionApiService.listCompetitions({
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          visibility: visibilityFilter === 'ALL' ? undefined : visibilityFilter,
          search: searchQuery.trim() || undefined,
        }),
        competitionApiService.getMyCompetitions().catch(() => []),
      ]);
      setCompetitions(listRes.competitions);
      setMyCompetitions(myRes);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to load competitions');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, visibilityFilter, searchQuery]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Set default dates for Create Form (tomorrow 9am to 5pm)
  useEffect(() => {
    const start = new Date(Date.now() + 3600000);
    const end = new Date(Date.now() + 86400000);
    const formatLocal = (d: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setFormStartTime(formatLocal(start));
    setFormEndTime(formatLocal(end));
  }, []);

  const myCompIds = new Set(myCompetitions.map((c) => c.id));

  const handleJoinPublic = async (comp: Competition) => {
    try {
      setIsSubmitting(true);
      await competitionApiService.joinCompetition(comp.id);
      await fetchAllData();
      navigate(`/competitions/${comp.id}`);
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || 'Failed to join competition');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinPrivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompForJoin) return;
    setJoinError(null);
    setIsSubmitting(true);
    try {
      await competitionApiService.joinCompetition(selectedCompForJoin.id, {
        joinCode: joinCodeInput.trim().toUpperCase(),
      });
      setIsJoinCodeOpen(false);
      setJoinCodeInput('');
      await fetchAllData();
      navigate(`/competitions/${selectedCompForJoin.id}`);
    } catch (err: any) {
      setJoinError(err?.response?.data?.error?.message || 'Invalid join code');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormCreateError(null);
    setIsSubmitting(true);
    try {
      const allowedArr = formAllowedInstruments
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      const created = await competitionApiService.createCompetition({
        name: formName.trim(),
        description: formDescription.trim(),
        visibility: formVisibility,
        joinCode: formVisibility === 'PRIVATE' ? formJoinCode.trim().toUpperCase() : undefined,
        startingCapital: parseFloat(formCapital).toFixed(4),
        maxParticipants: formMaxParticipants,
        minParticipants: formMinParticipants,
        startTime: new Date(formStartTime).toISOString(),
        endTime: new Date(formEndTime).toISOString(),
        allowedInstruments: allowedArr.length > 0 ? allowedArr : undefined,
        permittedOrderTypes: ['LIMIT', 'MARKET'],
      });

      setIsCreateOpen(false);
      setFormName('');
      setFormDescription('');
      await fetchAllData();
      navigate(`/competitions/${created.id}`);
    } catch (err: any) {
      setFormCreateError(err?.response?.data?.error?.message || 'Failed to create competition');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCompetitions = competitions.filter((comp) => {
    if (showOnlyMine && !myCompIds.has(comp.id)) return false;
    return true;
  });

  const getStatusBadge = (status: CompetitionStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            LIVE ACTIVE
          </span>
        );
      case 'UPCOMING':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5" />
            UPCOMING
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            COMPLETED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3.5 h-3.5" />
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card to-slate-900 border border-card-border p-6 rounded-2xl relative overflow-hidden">
        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
              <Trophy className="w-6 h-6" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight  text-slate-900 dark:text-white  font-mono">
              Trading Competitions
            </h1>
          </div>
          <p className="text-slate-400 text-sm max-w-2xl">
            Test your alpha against peers in time-boxed virtual markets. Every tournament provides
            dedicated isolated starting capital, fair Price-Time FIFO matching, and real-time leaderboards.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black hover:bg-black dark:hover:bg-neutral-200 font-semibold text-sm transition-all shadow-sm active:translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            Create Competition
          </button>
        </div>
      </div>

      {/* Filters & Control Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between bg-card/60 border border-card-border p-4 rounded-xl backdrop-blur-sm">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto bg-slate-900/60 p-1 rounded-lg border border-slate-800/80">
          {(['ALL', 'ACTIVE', 'UPCOMING', 'COMPLETED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium font-mono transition-all ${
                statusFilter === tab
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search & Secondary Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tournaments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <select
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value as any)}
            className="bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-300 px-3 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Visibility</option>
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private Only</option>
          </select>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none px-2 py-1.5 bg-slate-900/60 rounded-lg border border-slate-800">
            <input
              type="checkbox"
              checked={showOnlyMine}
              onChange={(e) => setShowOnlyMine(e.target.checked)}
              className="rounded border-slate-700 text-cyan-500 focus:ring-0"
            />
            My Tournaments
          </label>
        </div>
      </div>

      {/* Competitions Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
          <span className="text-xs font-mono text-slate-500">Retrieving competition registry...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : filteredCompetitions.length === 0 ? (
        <div className="text-center py-20 bg-card/30 border border-card-border rounded-2xl space-y-4">
          <Trophy className="w-12 h-12 text-slate-600 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">No Competitions Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              There are no competitions matching your current filters. Create a new tournament or check back soon!
            </p>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold rounded-lg transition-colors border border-cyan-500/30"
          >
            Create Competition
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCompetitions.map((comp) => {
            const isEnrolled = myCompIds.has(comp.id);

            return (
              <div
                key={comp.id}
                className="bg-card border border-card-border hover:border-slate-700 transition-all rounded-2xl flex flex-col justify-between overflow-hidden group shadow-lg"
              >
                {/* Card Header */}
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    {getStatusBadge(comp.status)}
                    <span className="flex items-center gap-1 text-[11px] font-mono font-medium text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {comp.visibility === 'PRIVATE' ? (
                        <>
                          <Lock className="w-3 h-3 text-amber-400" /> Private
                        </>
                      ) : (
                        <>
                          <Globe className="w-3 h-3 text-cyan-400" /> Public
                        </>
                      )}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-white text-base group-hover:text-cyan-400 transition-colors line-clamp-1">
                      {comp.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 min-h-[32px]">
                      {comp.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">Starting Capital</span>
                      <span className="text-xs font-bold font-mono text-emerald-400">
                        {formatCurrency(comp.startingCapital)}
                      </span>
                    </div>

                    <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">Traders</span>
                      <span className="text-xs font-bold font-mono text-white flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-cyan-400" />
                        {comp.participantCount || 0}
                        {comp.maxParticipants ? ` / ${comp.maxParticipants}` : ''}
                      </span>
                    </div>
                  </div>

                  {/* Timing Meta */}
                  <div className="space-y-1 text-[11px] text-slate-400 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Starts:</span>
                      <span>{new Date(comp.startTime).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Ends:</span>
                      <span>{new Date(comp.endTime).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 bg-slate-900/70 border-t border-card-border flex items-center justify-between gap-2">
                  {isEnrolled ? (
                    <button
                      onClick={() => navigate(`/competitions/${comp.id}`)}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-semibold text-xs transition-colors border border-cyan-500/40"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Enter Arena
                      <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                    </button>
                  ) : comp.status === 'UPCOMING' ? (
                    comp.visibility === 'PRIVATE' ? (
                      <button
                        onClick={() => {
                          setSelectedCompForJoin(comp);
                          setJoinError(null);
                          setIsJoinCodeOpen(true);
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors"
                      >
                        <Key className="w-3.5 h-3.5" />
                        Enter Join Code
                      </button>
                    ) : (
                      <button
                        onClick={() => handleJoinPublic(comp)}
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Join Competition
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => navigate(`/competitions/${comp.id}`)}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
                    >
                      View Leaderboard & Tape
                      <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Join Private Competition Code Prompt */}
      {isJoinCodeOpen && selectedCompForJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-card border border-card-border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Join Private Competition</h3>
                <p className="text-xs text-slate-400">{selectedCompForJoin.name}</p>
              </div>
            </div>

            <form onSubmit={handleJoinPrivateSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-mono text-slate-400 block mb-1">
                  Access Join Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP-ALPHA-2026"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono uppercase tracking-widest focus:outline-none focus:border-cyan-500"
                />
              </div>

              {joinError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs">
                  {joinError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsJoinCodeOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !joinCodeInput.trim()}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg transition-colors"
                >
                  {isSubmitting ? 'Joining...' : 'Verify & Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Competition */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-card border border-card-border rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Create Virtual Tournament</h3>
                <p className="text-xs text-slate-400">Launch a multiplayer trading contest with custom rules</p>
              </div>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-mono text-slate-400 block mb-1">Competition Title *</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    placeholder="e.g. Apex High-Frequency Invitational"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-mono text-slate-400 block mb-1">Description</label>
                  <textarea
                    rows={2}
                    placeholder="Brief description of rules, prizes, or theme..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono text-slate-400 block mb-1">Visibility</label>
                  <select
                    value={formVisibility}
                    onChange={(e) => setFormVisibility(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="PUBLIC">Public (Anyone can enroll)</option>
                    <option value="PRIVATE">Private (Password / Join Code)</option>
                  </select>
                </div>

                {formVisibility === 'PRIVATE' && (
                  <div>
                    <label className="text-xs font-mono text-slate-400 block mb-1">Join Code *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SECRET99"
                      value={formJoinCode}
                      onChange={(e) => setFormJoinCode(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono uppercase focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-mono text-slate-400 block mb-1">Starting Virtual Capital ($) *</label>
                  <input
                    type="number"
                    required
                    min={1000}
                    max={10000000}
                    step={1000}
                    value={formCapital}
                    onChange={(e) => setFormCapital(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-mono text-slate-400 block mb-1">Min Traders</label>
                    <input
                      type="number"
                      min={2}
                      value={formMinParticipants}
                      onChange={(e) => setFormMinParticipants(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-slate-400 block mb-1">Max Traders</label>
                    <input
                      type="number"
                      min={2}
                      max={10000}
                      value={formMaxParticipants}
                      onChange={(e) => setFormMaxParticipants(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-mono text-slate-400 block mb-1">Start Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono text-slate-400 block mb-1">End Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-mono text-slate-400 block mb-1">
                    Allowed Tradable Instruments (comma-separated symbols)
                  </label>
                  <input
                    type="text"
                    placeholder="ALPHA, BETA, TGRID, RELIANCE, TCS"
                    value={formAllowedInstruments}
                    onChange={(e) => setFormAllowedInstruments(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono uppercase focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Leave blank to permit all market instruments.
                  </span>
                </div>
              </div>

              {formCreateError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs">
                  {formCreateError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-lg shadow-cyan-500/20"
                >
                  {isSubmitting ? 'Launching...' : 'Create Competition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
