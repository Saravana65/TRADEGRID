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
  Shield,
  FileText,
  Zap,
} from 'lucide-react';
import {
  Competition,
  CompetitionVisibility,
} from '@tradegrid/shared-types';
import { competitionApiService } from '../services/competition.service';
import { formatCurrency, formatISTDate, formatCountdown } from '../utils/formatters';

type CompetitionTab =
  | 'UPCOMING'
  | 'REGISTRATION_OPEN'
  | 'REGISTERED'
  | 'LIVE'
  | 'COMPLETED'
  | 'HISTORY';

export const CompetitionsPage: React.FC = () => {
  const navigate = useNavigate();

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [myCompetitions, setMyCompetitions] = useState<Competition[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active Section Tab
  const [activeTab, setActiveTab] = useState<CompetitionTab>('LIVE');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [visibilityFilter, setVisibilityFilter] = useState<'ALL' | CompetitionVisibility>('ALL');

  // Rules Modal State
  const [selectedCompForRules, setSelectedCompForRules] = useState<Competition | null>(null);

  // Join Code Modal State
  const [isJoinCodeOpen, setIsJoinCodeOpen] = useState<boolean>(false);
  const [selectedCompForJoin, setSelectedCompForJoin] = useState<Competition | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [formName, setFormName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formVisibility, setFormVisibility] = useState<CompetitionVisibility>('PUBLIC');
  const [formJoinCode, setFormJoinCode] = useState<string>('');
  const [formCapital, setFormCapital] = useState<string>('500000');
  const [formMaxParticipants, setFormMaxParticipants] = useState<number>(100);
  const [formMinParticipants, setFormMinParticipants] = useState<number>(2);
  const [formStartTime, setFormStartTime] = useState<string>('');
  const [formEndTime, setFormEndTime] = useState<string>('');
  const [formAllowedInstruments, setFormAllowedInstruments] = useState<string>('RELIANCE, TCS, INFY, HDFCBANK, TGRID');
  const [formCreateError, setFormCreateError] = useState<string | null>(null);

  // Tick for live countdowns
  const [, setTick] = useState<number>(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [listRes, myRes] = await Promise.all([
        competitionApiService.listCompetitions({
          visibility: visibilityFilter === 'ALL' ? undefined : visibilityFilter,
          search: searchQuery.trim() || undefined,
          limit: 100,
        }),
        competitionApiService.getMyCompetitions().catch(() => []),
      ]);
      setCompetitions(Array.isArray(listRes.competitions) ? listRes.competitions : []);
      setMyCompetitions(Array.isArray(myRes) ? myRes : []);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to load competitions');
    } finally {
      setIsLoading(false);
    }
  }, [visibilityFilter, searchQuery]);

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
      alert(err?.response?.data?.error?.message || err?.message || 'Failed to join competition');
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
      setJoinError(err?.response?.data?.error?.message || err?.message || 'Invalid join code');
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
      setFormCreateError(err?.response?.data?.error?.message || err?.message || 'Failed to create competition');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group competitions according to the 6 organized sections
  const now = Date.now();

  const getSectionCompetitions = (tab: CompetitionTab): Competition[] => {
    return competitions.filter((comp) => {
      const isEnrolled = myCompIds.has(comp.id);
      const startTime = new Date(comp.startTime).getTime();
      const endTime = new Date(comp.endTime).getTime();
      const regEndTime = comp.registrationEndTime ? new Date(comp.registrationEndTime).getTime() : startTime;

      switch (tab) {
        case 'UPCOMING':
          // Scheduled to start in future, either DRAFT or UPCOMING
          return (comp.status === 'UPCOMING' || comp.status === 'DRAFT') && startTime > now;

        case 'REGISTRATION_OPEN':
          // Currently accepting enrollments
          return (
            comp.status === 'REGISTRATION_OPEN' ||
            ((comp.status === 'UPCOMING' || comp.status === 'DRAFT') && regEndTime > now)
          );

        case 'REGISTERED':
          // Enrolled by current user and not yet completed
          return isEnrolled && comp.status !== 'COMPLETED';

        case 'LIVE':
          // Currently in progress (ACTIVE)
          return comp.status === 'ACTIVE' || (startTime <= now && endTime > now && comp.status !== 'COMPLETED' && comp.status !== 'CANCELLED');

        case 'COMPLETED':
          // Ended tournaments
          return comp.status === 'COMPLETED' || endTime <= now;

        case 'HISTORY':
          // Tournaments where the user participated and they have finished
          return isEnrolled && (comp.status === 'COMPLETED' || endTime <= now);

        default:
          return true;
      }
    });
  };

  const displayedCompetitions = getSectionCompetitions(activeTab);

  const getStatusBadge = (comp: Competition) => {
    const isLive = comp.status === 'ACTIVE';
    const isRegOpen = comp.status === 'REGISTRATION_OPEN';
    const isUpcoming = comp.status === 'UPCOMING' || comp.status === 'DRAFT';
    const isCompleted = comp.status === 'COMPLETED';

    if (isLive) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          LIVE ARENA
        </span>
      );
    }
    if (isRegOpen) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-black">
          <Zap className="w-3.5 h-3.5" />
          REGISTRATION OPEN
        </span>
      );
    }
    if (isUpcoming) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-700 dark:bg-[#141414] dark:text-neutral-300 border border-neutral-200 dark:border-[#1F1F1F]">
          <Clock className="w-3.5 h-3.5" />
          UPCOMING
        </span>
      );
    }
    if (isCompleted) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400 border border-neutral-200 dark:border-[#1F1F1F]">
          <CheckCircle2 className="w-3.5 h-3.5" />
          COMPLETED
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400 border border-neutral-200 dark:border-[#1F1F1F]">
        {comp.status}
      </span>
    );
  };

  const tabs: { key: CompetitionTab; label: string; count: number }[] = [
    { key: 'LIVE', label: 'Live Competitions', count: getSectionCompetitions('LIVE').length },
    { key: 'REGISTRATION_OPEN', label: 'Registration Open', count: getSectionCompetitions('REGISTRATION_OPEN').length },
    { key: 'UPCOMING', label: 'Upcoming Competitions', count: getSectionCompetitions('UPCOMING').length },
    { key: 'REGISTERED', label: 'Registered Competitions', count: getSectionCompetitions('REGISTERED').length },
    { key: 'COMPLETED', label: 'Completed Competitions', count: getSectionCompetitions('COMPLETED').length },
    { key: 'HISTORY', label: 'My Competition History', count: getSectionCompetitions('HISTORY').length },
  ];

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] p-6 rounded-2xl shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-neutral-100 dark:bg-[#141414] text-neutral-900 dark:text-white rounded-xl border border-neutral-200 dark:border-[#1F1F1F]">
              <Trophy className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Trading Competitions
            </h1>
          </div>
          <p className="text-neutral-500 dark:text-neutral-400 text-sm max-w-2xl">
            Compete in fair, time-boxed simulated tournaments. Every tournament operates on Indian Standard Time (IST) schedules, provides dedicated isolated capital, and matches orders through the central matching engine.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-neutral-200 font-semibold text-sm transition-all shadow-sm active:translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            Host Competition
          </button>
        </div>
      </div>

      {/* 6-Section Tabs Toolbar */}
      <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] p-2 rounded-xl shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-black shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#141414]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    isActive
                      ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-black'
                      : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search & Filter Subbar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search tournaments by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl pl-9 pr-3 py-1.5 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value as any)}
            className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl text-xs text-neutral-700 dark:text-neutral-300 px-3 py-1.5 focus:outline-none focus:border-neutral-400"
          >
            <option value="ALL">All Visibilities</option>
            <option value="PUBLIC">Public Tournaments</option>
            <option value="PRIVATE">Private Tournaments</option>
          </select>
        </div>
      </div>

      {/* Competitions Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900 dark:border-white" />
          <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">Loading competition arena...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : displayedCompetitions.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl space-y-4">
          <Trophy className="w-12 h-12 text-neutral-400 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              No Competitions in this Section
            </h3>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              No tournaments currently match the selected view ({tabs.find((t) => t.key === activeTab)?.label}).
            </p>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-black text-xs font-semibold rounded-xl hover:bg-black dark:hover:bg-neutral-200 transition-colors"
          >
            Host New Competition
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedCompetitions.map((comp) => {
            const isEnrolled = myCompIds.has(comp.id);
            const isLive = comp.status === 'ACTIVE';
            const isRegOpen =
              comp.status === 'REGISTRATION_OPEN' ||
              (comp.status === 'UPCOMING' &&
                (!comp.registrationEndTime || new Date(comp.registrationEndTime).getTime() > now));
            const isCompleted = comp.status === 'COMPLETED';

            const countdownToStart = formatCountdown(comp.startTime);
            const countdownToEnd = formatCountdown(comp.endTime);
            const countdownToRegClose = comp.registrationEndTime
              ? formatCountdown(comp.registrationEndTime)
              : null;

            return (
              <div
                key={comp.id}
                className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] hover:border-neutral-400 dark:hover:border-neutral-600 transition-all rounded-2xl flex flex-col justify-between overflow-hidden shadow-sm"
              >
                {/* Card Header */}
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    {getStatusBadge(comp)}
                    <span className="flex items-center gap-1 text-[11px] font-mono font-medium text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-[#141414] px-2 py-0.5 rounded border border-neutral-200 dark:border-[#1F1F1F]">
                      {comp.visibility === 'PRIVATE' ? (
                        <>
                          <Lock className="w-3 h-3 text-amber-500" /> Private
                        </>
                      ) : (
                        <>
                          <Globe className="w-3 h-3" /> Public
                        </>
                      )}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-neutral-900 dark:text-white text-base line-clamp-1">
                      {comp.name}
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2 min-h-[32px]">
                      {comp.description || 'Virtual trading tournament hosted on TRADEGRID.'}
                    </p>
                  </div>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-100 dark:border-[#1F1F1F]">
                    <div className="bg-neutral-50 dark:bg-[#141414] p-2.5 rounded-xl border border-neutral-200 dark:border-[#1F1F1F]">
                      <span className="text-[10px] text-neutral-500 uppercase font-mono block">Starting Capital</span>
                      <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(comp.startingCapital)}
                      </span>
                    </div>

                    <div className="bg-neutral-50 dark:bg-[#141414] p-2.5 rounded-xl border border-neutral-200 dark:border-[#1F1F1F]">
                      <span className="text-[10px] text-neutral-500 uppercase font-mono block">Enrolled Traders</span>
                      <span className="text-xs font-bold font-mono text-neutral-900 dark:text-white flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-neutral-500" />
                        {comp.participantCount || 0}
                        {comp.maxParticipants ? ` / ${comp.maxParticipants}` : ''}
                      </span>
                    </div>
                  </div>

                  {/* IST Schedule & Countdown Timers */}
                  <div className="space-y-1.5 text-[11px] font-mono pt-1 border-t border-neutral-100 dark:border-[#1F1F1F]">
                    {isLive ? (
                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                        <span>Arena Closes In:</span>
                        <span>{countdownToEnd}</span>
                      </div>
                    ) : isRegOpen && countdownToRegClose ? (
                      <div className="flex items-center justify-between text-neutral-900 dark:text-white font-semibold bg-neutral-100 dark:bg-[#141414] px-2.5 py-1 rounded-lg">
                        <span>Reg Closes In:</span>
                        <span>{countdownToRegClose}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
                        <span>Starts In:</span>
                        <span>{countdownToStart}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-neutral-500">
                      <span>Start Time:</span>
                      <span className="text-neutral-800 dark:text-neutral-200">{formatISTDate(comp.startTime)}</span>
                    </div>
                    <div className="flex items-center justify-between text-neutral-500">
                      <span>End Time:</span>
                      <span className="text-neutral-800 dark:text-neutral-200">{formatISTDate(comp.endTime)}</span>
                    </div>
                  </div>

                  {/* Rules preview button */}
                  {comp.rules && (
                    <button
                      type="button"
                      onClick={() => setSelectedCompForRules(comp)}
                      className="text-[11px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1 underline pt-1"
                    >
                      <FileText className="w-3 h-3" /> View Tournament Rules
                    </button>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 bg-neutral-50 dark:bg-[#141414] border-t border-neutral-200 dark:border-[#1F1F1F] flex items-center justify-between gap-2">
                  {isEnrolled ? (
                    isLive ? (
                      <button
                        onClick={() => navigate(`/competitions/${comp.id}`)}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        ENTER ARENA
                        <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/competitions/${comp.id}`)}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-neutral-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-neutral-200 font-semibold text-xs transition-colors shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        {isCompleted ? 'View Final Results' : 'Enrolled — View Arena'}
                        <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                      </button>
                    )
                  ) : isRegOpen ? (
                    comp.visibility === 'PRIVATE' ? (
                      <button
                        onClick={() => {
                          setSelectedCompForJoin(comp);
                          setJoinError(null);
                          setIsJoinCodeOpen(true);
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-neutral-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-neutral-200 font-semibold text-xs transition-colors"
                      >
                        <Key className="w-3.5 h-3.5" />
                        Enter Private Join Code
                      </button>
                    ) : (
                      <button
                        onClick={() => handleJoinPublic(comp)}
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-neutral-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-neutral-200 font-semibold text-xs transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Register for Tournament
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => navigate(`/competitions/${comp.id}`)}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold text-xs transition-colors"
                    >
                      {isCompleted ? 'View Standings & Ledger' : 'View Arena Details'}
                      <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rules Modal */}
      {selectedCompForRules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-[#1F1F1F] pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-neutral-900 dark:text-white" />
                <h3 className="font-bold text-neutral-900 dark:text-white text-sm">
                  Tournament Rules — {selectedCompForRules.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedCompForRules(null)}
                className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed whitespace-pre-wrap">
              {selectedCompForRules.rules || 'Standard TRADEGRID tournament guidelines apply. Fair Price-Time matching, strictly simulated capital, and double-entry ledger settlement.'}
            </div>
            <div className="flex justify-end pt-2 border-t border-neutral-200 dark:border-[#1F1F1F]">
              <button
                onClick={() => setSelectedCompForRules(null)}
                className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-black rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Private Join Code Modal */}
      {isJoinCodeOpen && selectedCompForJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-[#1F1F1F] pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-neutral-900 dark:text-white" />
                <h3 className="font-bold text-neutral-900 dark:text-white text-sm">
                  Private Competition Access Code
                </h3>
              </div>
              <button
                onClick={() => setIsJoinCodeOpen(false)}
                className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleJoinPrivateSubmit} className="space-y-4 text-xs">
              <p className="text-neutral-600 dark:text-neutral-400">
                &quot;{selectedCompForJoin.name}&quot; is a private invitational competition. Please enter the invitation pass code provided by the organizer.
              </p>

              {joinError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs">
                  {joinError}
                </div>
              )}

              <div>
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">Join Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ALPHA2026"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl px-3 py-2 text-neutral-900 dark:text-white font-mono uppercase focus:outline-none focus:border-neutral-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-[#1F1F1F]">
                <button
                  type="button"
                  onClick={() => setIsJoinCodeOpen(false)}
                  className="px-4 py-2 text-neutral-600 dark:text-neutral-400 text-xs font-semibold hover:text-neutral-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-black rounded-xl text-xs font-semibold disabled:opacity-50"
                >
                  {isSubmitting ? 'Verifying...' : 'Unlock & Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Host New Competition Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-[#1F1F1F] pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-neutral-900 dark:text-white" />
                <h3 className="font-bold text-neutral-900 dark:text-white text-sm">
                  Host New Trading Competition
                </h3>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              {formCreateError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs">
                  {formCreateError}
                </div>
              )}

              <div>
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">Competition Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dalal Street Alpha Sprint"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                />
              </div>

              <div>
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">Description</label>
                <textarea
                  rows={2}
                  placeholder="Rules, theme, and scoring methodology..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">Visibility</label>
                  <select
                    value={formVisibility}
                    onChange={(e) => setFormVisibility(e.target.value as any)}
                    className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="PRIVATE">Private (Invite Only)</option>
                  </select>
                </div>

                {formVisibility === 'PRIVATE' && (
                  <div>
                    <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">Join Pass Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. VIP2026"
                      value={formJoinCode}
                      onChange={(e) => setFormJoinCode(e.target.value)}
                      className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl px-3 py-2 text-neutral-900 dark:text-white font-mono uppercase focus:outline-none focus:border-neutral-400"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">Starting Capital ($)</label>
                  <input
                    type="number"
                    min={1000}
                    max={10000000}
                    value={formCapital}
                    onChange={(e) => setFormCapital(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl px-3 py-2 text-neutral-900 dark:text-white font-mono focus:outline-none focus:border-neutral-400"
                  />
                </div>

                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">Min Participants</label>
                  <input
                    type="number"
                    min={2}
                    max={100}
                    value={formMinParticipants}
                    onChange={(e) => setFormMinParticipants(parseInt(e.target.value, 10) || 2)}
                    className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl px-3 py-2 text-neutral-900 dark:text-white font-mono focus:outline-none focus:border-neutral-400"
                  />
                </div>

                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">Max Participants</label>
                  <input
                    type="number"
                    min={2}
                    max={1000}
                    value={formMaxParticipants}
                    onChange={(e) => setFormMaxParticipants(parseInt(e.target.value, 10) || 50)}
                    className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl px-3 py-2 text-neutral-900 dark:text-white font-mono focus:outline-none focus:border-neutral-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">Start Time (Local / IST)</label>
                  <input
                    type="datetime-local"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                  />
                </div>

                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">End Time (Local / IST)</label>
                  <input
                    type="datetime-local"
                    required
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">Allowed Symbols (Comma Separated)</label>
                <input
                  type="text"
                  placeholder="RELIANCE, TCS, INFY, HDFCBANK, TGRID"
                  value={formAllowedInstruments}
                  onChange={(e) => setFormAllowedInstruments(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl px-3 py-2 text-neutral-900 dark:text-white font-mono focus:outline-none focus:border-neutral-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-[#1F1F1F]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-neutral-600 dark:text-neutral-400 text-xs font-semibold hover:text-neutral-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-black rounded-xl text-xs font-semibold disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Tournament'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
