import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Trophy,
  Users,
  Clock,
  ArrowLeft,
  Activity,
  Shield,
  AlertCircle,
  Lock,
  Globe,
  Radio,
  Play,
} from 'lucide-react';
import {
  Competition,
  CompetitionParticipant,
  CompetitionPortfolioSummary,
  CompetitionLeaderboardEntry,
  CompetitionOrder,
  CompetitionTrade,
  OrderSide,
  OrderType,
  MarketQuote,
} from '@tradegrid/shared-types';
import { competitionApiService } from '../services/competition.service';
import { marketApiService } from '../services/market.service';
import { socketService } from '../services/socket.service';
import { useAuthStore } from '../store/authStore';
import { formatCurrency, formatPercent } from '../utils/formatters';

export const CompetitionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const compId = parseInt(id || '0', 10);

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [leaderboard, setLeaderboard] = useState<CompetitionLeaderboardEntry[]>([]);
  const [participants, setParticipants] = useState<CompetitionParticipant[]>([]);
  const [portfolio, setPortfolio] = useState<CompetitionPortfolioSummary | null>(null);
  const [openOrders, setOpenOrders] = useState<CompetitionOrder[]>([]);
  const [recentTrades, setRecentTrades] = useState<CompetitionTrade[]>([]);
  const [marketQuotes, setMarketQuotes] = useState<MarketQuote[]>([]);

  const [activeTab, setActiveTab] = useState<'LEADERBOARD' | 'TRADING' | 'TRADES' | 'RULES'>('LEADERBOARD');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Order Entry State
  const [orderSymbol, setOrderSymbol] = useState<string>('');
  const [orderSide, setOrderSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('LIMIT');
  const [orderQuantity, setOrderQuantity] = useState<string>('10');
  const [orderPrice, setOrderPrice] = useState<string>('100.00');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  // Time remaining countdown
  const [timeRemainingStr, setTimeRemainingStr] = useState<string>('');

  const isEnrolled = participants.some((p) => p.userId === user?.id && p.status === 'JOINED');

  // Initial Data Fetch
  const loadAllData = useCallback(async () => {
    if (!compId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [compRes, lbRes, partsRes, quotesRes] = await Promise.all([
        competitionApiService.getCompetition(compId),
        competitionApiService.getLeaderboard(compId).catch(() => ({ leaderboard: [] } as any)),
        competitionApiService.listParticipants(compId).catch(() => []),
        marketApiService.getQuotes().catch(() => []),
      ]);

      setCompetition(compRes);
      setLeaderboard(Array.isArray(lbRes.leaderboard) ? lbRes.leaderboard : []);
      setParticipants(Array.isArray(partsRes) ? partsRes : []);
      setMarketQuotes(Array.isArray(quotesRes) ? quotesRes : []);

      // Default selected instrument
      if (compRes.allowedInstruments && compRes.allowedInstruments.length > 0) {
        setOrderSymbol(compRes.allowedInstruments[0]);
      } else if (quotesRes.length > 0) {
        setOrderSymbol(quotesRes[0].symbol);
      }

      // If user is joined, load their competition portfolio & orders
      const userJoined = partsRes.some((p: any) => p.userId === user?.id && p.status === 'JOINED');
      if (userJoined) {
        const [portRes, ordersRes, tradesRes] = await Promise.all([
          competitionApiService.getPortfolio(compId).catch(() => null),
          competitionApiService.getOrders(compId).catch(() => []),
          competitionApiService.getTrades(compId).catch(() => []),
        ]);
        setPortfolio(portRes);
        setOpenOrders(Array.isArray(ordersRes) ? ordersRes : []);
        setRecentTrades(Array.isArray(tradesRes) ? tradesRes : []);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to load tournament data');
    } finally {
      setIsLoading(false);
    }
  }, [compId, user?.id]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Real-Time Socket.IO Subscription
  useEffect(() => {
    if (!compId) return;

    socketService.connect();
    const channel = `competition:${compId}`;
    socketService.subscribe(channel);

    const handleLeaderboardUpdate = (event: any) => {
      if (event.competitionId === compId && Array.isArray(event.leaderboard)) {
        setLeaderboard(event.leaderboard);
      }
    };

    const handleTradeExecuted = (event: any) => {
      if (event.competitionId === compId && event.trade) {
        setRecentTrades((prev) => [event.trade, ...prev].slice(0, 50));
      }
    };

    const handleStatusChanged = (event: any) => {
      if (event.competitionId === compId && event.status) {
        setCompetition((prev) => (prev ? { ...prev, status: event.status } : null));
      }
    };

    const handleCompleted = (event: any) => {
      if (event.competitionId === compId) {
        setCompetition((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null));
        if (event.finalLeaderboard) {
          setLeaderboard(event.finalLeaderboard);
        }
      }
    };

    socketService.on('competition:leaderboard_updated', handleLeaderboardUpdate);
    socketService.on('competition:trade_executed', handleTradeExecuted);
    socketService.on('competition:status_changed', handleStatusChanged);
    socketService.on('competition:completed', handleCompleted);

    return () => {
      socketService.off('competition:leaderboard_updated', handleLeaderboardUpdate);
      socketService.off('competition:trade_executed', handleTradeExecuted);
      socketService.off('competition:status_changed', handleStatusChanged);
      socketService.off('competition:completed', handleCompleted);
      socketService.unsubscribe(channel);
    };
  }, [compId]);

  // Countdown Timer Logic
  useEffect(() => {
    if (!competition) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (competition.status === 'UPCOMING') {
        const diff = new Date(competition.startTime).getTime() - now;
        if (diff <= 0) {
          setTimeRemainingStr('Starting momentarily...');
        } else {
          const hours = Math.floor(diff / 3600000);
          const mins = Math.floor((diff % 3600000) / 60000);
          const secs = Math.floor((diff % 60000) / 1000);
          setTimeRemainingStr(`Starts in ${hours}h ${mins}m ${secs}s`);
        }
      } else if (competition.status === 'ACTIVE') {
        const diff = new Date(competition.endTime).getTime() - now;
        if (diff <= 0) {
          setTimeRemainingStr('Ending momentarily...');
        } else {
          const hours = Math.floor(diff / 3600000);
          const mins = Math.floor((diff % 3600000) / 60000);
          const secs = Math.floor((diff % 60000) / 1000);
          setTimeRemainingStr(`Ends in ${hours}h ${mins}m ${secs}s`);
        }
      } else {
        setTimeRemainingStr('');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [competition]);

  // Handle Order Submit
  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError(null);
    setOrderSuccess(null);
    setIsSubmittingOrder(true);

    try {
      const targetQuote = marketQuotes.find((q) => q.symbol.toUpperCase() === orderSymbol.toUpperCase());
      const instrumentId = targetQuote ? targetQuote.instrumentId : 1;

      const result = await competitionApiService.submitOrder(compId, {
        instrumentId,
        side: orderSide,
        orderType,
        quantity: parseFloat(orderQuantity).toFixed(4),
        limitPrice: orderType === 'LIMIT' ? parseFloat(orderPrice).toFixed(4) : undefined,
      });

      setOrderSuccess(`Order #${result.order.id} accepted (${result.order.status})`);
      // Refresh portfolio and orders
      const [port, ords] = await Promise.all([
        competitionApiService.getPortfolio(compId),
        competitionApiService.getOrders(compId),
      ]);
      setPortfolio(port);
      setOpenOrders(Array.isArray(ords) ? ords : []);
    } catch (err: any) {
      setOrderError(err?.response?.data?.error?.message || err?.message || 'Failed to submit order');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Handle Order Cancel
  const handleOrderCancel = async (orderId: number) => {
    try {
      await competitionApiService.cancelOrder(compId, orderId);
      const [port, ords] = await Promise.all([
        competitionApiService.getPortfolio(compId),
        competitionApiService.getOrders(compId),
      ]);
      setPortfolio(port);
      setOpenOrders(Array.isArray(ords) ? ords : []);
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || 'Failed to cancel order');
    }
  };

  // Handle Join Competition
  const handleJoin = async () => {
    try {
      await competitionApiService.joinCompetition(compId);
      await loadAllData();
      setActiveTab('TRADING');
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || 'Failed to join competition');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900 dark:border-white" />
        <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400">Loading competition arena...</span>
      </div>
    );
  }

  if (error || !competition) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <button
          onClick={() => navigate('/competitions')}
          className="flex items-center gap-2 text-xs font-mono text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Competitions
        </button>
        <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error || 'Competition not found'}</span>
        </div>
      </div>
    );
  }

  const winner = competition.status === 'COMPLETED' && leaderboard.length > 0 ? leaderboard[0] : null;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Breadcrumb Back Button */}
      <button
        onClick={() => navigate('/competitions')}
        className="flex items-center gap-2 text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Return to Competitions
      </button>

      {/* Main Tournament Banner */}
      <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] p-6 rounded-2xl relative overflow-hidden space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">
                {competition.name}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono ${
                  competition.status === 'ACTIVE'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : competition.status === 'UPCOMING'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700'
                }`}
              >
                {competition.status}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-mono text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900 px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800">
                {competition.visibility === 'PRIVATE' ? (
                  <>
                    <Lock className="w-3 h-3 text-amber-500" /> Private Room
                  </>
                ) : (
                  <>
                    <Globe className="w-3 h-3 text-neutral-500 dark:text-neutral-400" /> Public Arena
                  </>
                )}
              </span>
            </div>

            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-3xl">
              {competition.description || 'Virtual trading tournament hosted on TRADEGRID.'}
            </p>
          </div>

          {/* Timing / Countdown / Join Action */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {timeRemainingStr && (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs font-mono font-medium text-neutral-800 dark:text-neutral-200">
                <Clock className="w-4 h-4 text-amber-500" />
                {timeRemainingStr}
              </div>
            )}

            {!isEnrolled && competition.status === 'UPCOMING' && (
              <button
                onClick={handleJoin}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm"
              >
                Join Tournament
              </button>
            )}
          </div>
        </div>

        {/* Highlight Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800/80">
          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono block">Starting Capital</span>
            <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatCurrency(competition.startingCapital)}
            </span>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono block">Enrolled Traders</span>
            <span className="text-sm font-bold font-mono text-neutral-900 dark:text-white flex items-center gap-1.5">
              <Users className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
              {competition.participantCount || 0}
              {competition.maxParticipants ? ` / ${competition.maxParticipants}` : ''}
            </span>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono block">Tournament Start</span>
            <span className="text-xs font-mono text-neutral-800 dark:text-neutral-200">
              {new Date(competition.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
            </span>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-900/60 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono block">Tournament End</span>
            <span className="text-xs font-mono text-neutral-800 dark:text-neutral-200">
              {new Date(competition.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* Winner Podium Banner if Completed */}
      {winner && (
        <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-500 border border-amber-500/30 flex items-center justify-center text-2xl shadow-sm">
              🏆
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-amber-600 dark:text-amber-400 font-bold block">
                Tournament Winner & Champion
              </span>
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white font-mono">{winner.username}</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Outperformed all competitors with deterministic tie-breakers verified by server.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono block">Final Return</span>
              <span
                className={`text-lg font-bold font-mono ${
                  parseFloat(winner.totalReturnPercent) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {parseFloat(winner.totalReturnPercent) >= 0 ? '+' : ''}
                {formatPercent(winner.totalReturnPercent)}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono block">Portfolio Value</span>
              <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {formatCurrency(winner.portfolioValue)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto">
        <button
          onClick={() => setActiveTab('LEADERBOARD')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-mono font-semibold border-b-2 transition-all ${
            activeTab === 'LEADERBOARD'
              ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Live Leaderboard ({leaderboard.length})
        </button>

        {isEnrolled && (
          <button
            onClick={() => setActiveTab('TRADING')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-mono font-semibold border-b-2 transition-all ${
              activeTab === 'TRADING'
                ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            Trading Terminal
          </button>
        )}

        <button
          onClick={() => setActiveTab('TRADES')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-mono font-semibold border-b-2 transition-all ${
            activeTab === 'TRADES'
              ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          <Radio className="w-4 h-4 text-emerald-500" />
          Execution Tape ({recentTrades.length})
        </button>

        <button
          onClick={() => setActiveTab('RULES')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-mono font-semibold border-b-2 transition-all ${
            activeTab === 'RULES'
              ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          <Shield className="w-4 h-4" />
          Rules & Integrity
        </button>
      </div>

      {/* Tab 1: Leaderboard */}
      {activeTab === 'LEADERBOARD' && (
        <div className="space-y-6">
          {/* Top 3 Podium (if >= 3 participants) */}
          {leaderboard.length >= 3 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* 2nd Place */}
              <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-neutral-800 p-4 rounded-2xl flex flex-col items-center text-center space-y-2 order-2 md:order-1 shadow-sm">
                <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center font-mono font-bold text-sm">
                  2
                </span>
                <span className="font-bold text-neutral-900 dark:text-white font-mono text-sm">{leaderboard[1].username}</span>
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  {formatCurrency(leaderboard[1].portfolioValue)}
                </span>
                <span
                  className={`text-xs font-mono font-semibold ${
                    parseFloat(leaderboard[1].totalReturnPercent) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {parseFloat(leaderboard[1].totalReturnPercent) >= 0 ? '+' : ''}
                  {formatPercent(leaderboard[1].totalReturnPercent)}
                </span>
              </div>

              {/* 1st Place */}
              <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl flex flex-col items-center text-center space-y-2.5 order-1 md:order-2 shadow-sm">
                <span className="w-10 h-10 rounded-full bg-amber-500 text-neutral-950 flex items-center justify-center font-mono font-bold text-base shadow-sm">
                  👑
                </span>
                <span className="font-bold text-neutral-900 dark:text-white font-mono text-base">{leaderboard[0].username}</span>
                <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(leaderboard[0].portfolioValue)}
                </span>
                <span
                  className={`text-xs font-bold font-mono ${
                    parseFloat(leaderboard[0].totalReturnPercent) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {parseFloat(leaderboard[0].totalReturnPercent) >= 0 ? '+' : ''}
                  {formatPercent(leaderboard[0].totalReturnPercent)}
                </span>
              </div>

              {/* 3rd Place */}
              <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-neutral-800 p-4 rounded-2xl flex flex-col items-center text-center space-y-2 order-3 shadow-sm">
                <span className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 flex items-center justify-center font-mono font-bold text-sm">
                  3
                </span>
                <span className="font-bold text-neutral-900 dark:text-white font-mono text-sm">{leaderboard[2].username}</span>
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  {formatCurrency(leaderboard[2].portfolioValue)}
                </span>
                <span
                  className={`text-xs font-mono font-semibold ${
                    parseFloat(leaderboard[2].totalReturnPercent) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {parseFloat(leaderboard[2].totalReturnPercent) >= 0 ? '+' : ''}
                  {formatPercent(leaderboard[2].totalReturnPercent)}
                </span>
              </div>
            </div>
          )}

          {/* Full Leaderboard Table */}
          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 dark:bg-neutral-900/80 text-neutral-500 dark:text-neutral-400 font-mono uppercase tracking-wider text-[10px] border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="py-3 px-4">Rank</th>
                    <th className="py-3 px-4">Trader</th>
                    <th className="py-3 px-4 text-right">Portfolio Value</th>
                    <th className="py-3 px-4 text-right">Return %</th>
                    <th className="py-3 px-4 text-right">Realized PnL</th>
                    <th className="py-3 px-4 text-right">Trades</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800/60 font-mono">
                  {leaderboard.map((entry) => {
                    const isCurrentUser = entry.userId === user?.id;
                    const returnVal = parseFloat(entry.totalReturnPercent);

                    return (
                      <tr
                        key={entry.userId}
                        className={`hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition-colors ${
                          isCurrentUser ? 'bg-neutral-100 dark:bg-neutral-900 border-l-2 border-l-neutral-900 dark:border-l-white' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-bold text-neutral-900 dark:text-white">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                              entry.rank === 1
                                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                : entry.rank === 2
                                ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                                : entry.rank === 3
                                ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-400'
                                : 'text-neutral-400 dark:text-neutral-500'
                            }`}
                          >
                            #{entry.rank}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                          <span>{entry.username}</span>
                          {isCurrentUser && (
                            <span className="text-[10px] bg-neutral-900 text-white dark:bg-white dark:text-black px-1.5 py-0.5 rounded font-mono font-semibold">
                              YOU
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-neutral-900 dark:text-neutral-100">
                          {formatCurrency(entry.portfolioValue)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-bold ${
                            returnVal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {returnVal >= 0 ? '+' : ''}
                          {formatPercent(entry.totalReturnPercent)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right ${
                            parseFloat(entry.realizedPnL) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {parseFloat(entry.realizedPnL) >= 0 ? '+' : ''}
                          {formatCurrency(entry.realizedPnL)}
                        </td>
                        <td className="py-3 px-4 text-right text-neutral-500 dark:text-neutral-400">{entry.tradeCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Trading Terminal */}
      {activeTab === 'TRADING' && isEnrolled && (
        <div className="space-y-6">
          {/* Isolated Portfolio Metrics Banner */}
          {portfolio && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] p-4 rounded-2xl shadow-sm">
              <div>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono block">Available Cash</span>
                <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(portfolio.availableCash)}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono block">Reserved In Orders</span>
                <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
                  {formatCurrency(portfolio.reservedCash)}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono block">Net Portfolio Value</span>
                <span className="text-sm font-bold font-mono text-neutral-900 dark:text-white">
                  {formatCurrency(portfolio.totalPortfolioValue)}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono block">Total Return</span>
                <span
                  className={`text-sm font-bold font-mono ${
                    parseFloat(portfolio.totalReturnPercent) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {parseFloat(portfolio.totalReturnPercent) >= 0 ? '+' : ''}
                  {formatPercent(portfolio.totalReturnPercent)}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-mono block">Current Rank</span>
                <span className="text-sm font-bold font-mono text-neutral-900 dark:text-white">
                  #{portfolio.rank} of {competition.participantCount || 0}
                </span>
              </div>
            </div>
          )}

          {/* Order Placement Desk */}
          {competition.status === 'ACTIVE' ? (
            <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] p-6 rounded-2xl space-y-4 shadow-sm">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white font-mono flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-500 fill-current" />
                Competition Order Desk (Isolated Order Book)
              </h3>

              <form onSubmit={handleOrderSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                {/* Instrument */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 block mb-1">Tradable Instrument</label>
                  <select
                    value={orderSymbol}
                    onChange={(e) => setOrderSymbol(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs font-mono text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
                  >
                    {(competition.allowedInstruments && competition.allowedInstruments.length > 0
                      ? competition.allowedInstruments
                      : marketQuotes.map((q) => q.symbol)
                    ).map((sym) => (
                      <option key={sym} value={sym}>
                        {sym}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Side */}
                <div>
                  <label className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 block mb-1">Side</label>
                  <div className="grid grid-cols-2 gap-1 bg-neutral-100 dark:bg-neutral-900 p-1 rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setOrderSide('BUY')}
                      className={`py-1 text-xs font-bold font-mono rounded-lg transition-colors ${
                        orderSide === 'BUY'
                          ? 'bg-emerald-600 text-white'
                          : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                      }`}
                    >
                      BUY
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderSide('SELL')}
                      className={`py-1 text-xs font-bold font-mono rounded-lg transition-colors ${
                        orderSide === 'SELL' ? 'bg-rose-600 text-white' : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                      }`}
                    >
                      SELL
                    </button>
                  </div>
                </div>

                {/* Order Type */}
                <div>
                  <label className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 block mb-1">Type</label>
                  <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value as any)}
                    className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs font-mono text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
                  >
                    <option value="LIMIT">LIMIT</option>
                    <option value="MARKET">MARKET</option>
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 block mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={orderQuantity}
                    onChange={(e) => setOrderQuantity(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs font-mono text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
                  />
                </div>

                {/* Price (if LIMIT) */}
                <div>
                  <label className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 block mb-1">
                    {orderType === 'LIMIT' ? 'Limit Price ($)' : 'Market Exec'}
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    disabled={orderType === 'MARKET'}
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 disabled:opacity-40 rounded-xl px-3 py-2 text-xs font-mono text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
                  />
                </div>

                {/* Submit Action */}
                <div className="md:col-span-6 flex items-center justify-between pt-2 border-t border-neutral-200 dark:border-neutral-800">
                  <div className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
                    Est. Outlay:{' '}
                    <span className="text-neutral-900 dark:text-white font-bold">
                      {orderType === 'LIMIT'
                        ? formatCurrency((parseFloat(orderQuantity || '0') * parseFloat(orderPrice || '0')).toFixed(4))
                        : 'Market Best Price'}
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingOrder}
                    className={`px-5 py-2 font-bold text-xs rounded-xl font-mono transition-all ${
                      orderSide === 'BUY'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-rose-600 hover:bg-rose-500 text-white'
                    }`}
                  >
                    {isSubmittingOrder ? 'Submitting...' : `Submit ${orderSide} Order`}
                  </button>
                </div>
              </form>

              {orderError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-mono">
                  {orderError}
                </div>
              )}
              {orderSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs font-mono">
                  {orderSuccess}
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-2xl text-center space-y-2">
              <Clock className="w-8 h-8 text-amber-500 mx-auto" />
              <h4 className="text-sm font-bold text-neutral-900 dark:text-white">Trading is Closed</h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
                Orders can only be submitted when the competition is ACTIVE. Orders placed during completed tournaments are rejected.
              </p>
            </div>
          )}

          {/* Active Positions */}
          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-neutral-200 dark:border-[#1F1F1F] flex items-center justify-between">
              <h4 className="font-bold text-neutral-900 dark:text-white text-xs font-mono">Active Tournament Holdings</h4>
              <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                {portfolio?.positions?.length || 0} Open Positions
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-neutral-50 dark:bg-neutral-900/80 text-neutral-500 dark:text-neutral-400 text-[10px] uppercase border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="py-2.5 px-4">Instrument</th>
                    <th className="py-2.5 px-4 text-right">Quantity</th>
                    <th className="py-2.5 px-4 text-right">Avg Entry</th>
                    <th className="py-2.5 px-4 text-right">Market Price</th>
                    <th className="py-2.5 px-4 text-right">Market Value</th>
                    <th className="py-2.5 px-4 text-right">Unrealized PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {(!portfolio?.positions || portfolio.positions.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-neutral-400 dark:text-neutral-500">
                        No positions held in this competition yet.
                      </td>
                    </tr>
                  ) : (
                    portfolio.positions.map((pos) => (
                      <tr key={pos.instrumentId} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                        <td className="py-2.5 px-4 font-bold text-neutral-900 dark:text-white">{pos.symbol}</td>
                        <td className="py-2.5 px-4 text-right text-neutral-700 dark:text-neutral-300">{pos.quantity}</td>
                        <td className="py-2.5 px-4 text-right text-neutral-500 dark:text-neutral-400">{formatCurrency(pos.averageEntryPrice)}</td>
                        <td className="py-2.5 px-4 text-right text-neutral-700 dark:text-neutral-300">{formatCurrency(pos.currentPrice)}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-neutral-900 dark:text-neutral-100">{formatCurrency(pos.marketValue)}</td>
                        <td
                          className={`py-2.5 px-4 text-right font-bold ${
                            parseFloat(pos.unrealizedPnL) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {parseFloat(pos.unrealizedPnL) >= 0 ? '+' : ''}
                          {formatCurrency(pos.unrealizedPnL)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Open Orders */}
          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-neutral-200 dark:border-[#1F1F1F] flex items-center justify-between">
              <h4 className="font-bold text-neutral-900 dark:text-white text-xs font-mono">Resting Competition Orders</h4>
              <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">{openOrders.length} Orders</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-neutral-50 dark:bg-neutral-900/80 text-neutral-500 dark:text-neutral-400 text-[10px] uppercase border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="py-2.5 px-4">Order ID</th>
                    <th className="py-2.5 px-4">Instrument</th>
                    <th className="py-2.5 px-4">Side</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4 text-right">Price</th>
                    <th className="py-2.5 px-4 text-right">Qty</th>
                    <th className="py-2.5 px-4 text-right">Filled</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {openOrders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-neutral-400 dark:text-neutral-500">
                        No active orders in this competition.
                      </td>
                    </tr>
                  ) : (
                    openOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                        <td className="py-2.5 px-4 text-neutral-500 dark:text-neutral-400">#{ord.id}</td>
                        <td className="py-2.5 px-4 font-bold text-neutral-900 dark:text-white">{ord.symbol}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              ord.side === 'BUY'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {ord.side}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-neutral-700 dark:text-neutral-300">{ord.orderType}</td>
                        <td className="py-2.5 px-4 text-right text-neutral-700 dark:text-neutral-300">
                          {ord.limitPrice ? formatCurrency(ord.limitPrice) : 'MKT'}
                        </td>
                        <td className="py-2.5 px-4 text-right text-neutral-700 dark:text-neutral-300">{ord.quantity}</td>
                        <td className="py-2.5 px-4 text-right text-neutral-700 dark:text-neutral-300">{ord.filledQuantity}</td>
                        <td className="py-2.5 px-4">
                          <span className="text-[10px] bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 px-1.5 py-0.5 rounded">
                            {ord.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {ord.status === 'OPEN' && competition.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleOrderCancel(ord.id)}
                              className="text-rose-600 hover:text-rose-500 dark:text-rose-400 dark:hover:text-rose-300 text-xs font-semibold"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Execution Tape */}
      {activeTab === 'TRADES' && (
        <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl overflow-hidden shadow-sm space-y-4">
          <div className="p-4 border-b border-neutral-200 dark:border-[#1F1F1F] flex items-center justify-between">
            <h4 className="font-bold text-neutral-900 dark:text-white text-xs font-mono flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
              Live Tournament Trade Tape
            </h4>
            <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">Streamed via Socket.IO</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-neutral-50 dark:bg-neutral-900/80 text-neutral-500 dark:text-neutral-400 text-[10px] uppercase border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="py-2.5 px-4">Time</th>
                  <th className="py-2.5 px-4">Trade ID</th>
                  <th className="py-2.5 px-4">Instrument</th>
                  <th className="py-2.5 px-4 text-right">Price</th>
                  <th className="py-2.5 px-4 text-right">Quantity</th>
                  <th className="py-2.5 px-4 text-right">Total Outlay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {recentTrades.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-400 dark:text-neutral-500">
                      No trades recorded in this competition yet.
                    </td>
                  </tr>
                ) : (
                  recentTrades.map((t) => (
                    <tr key={t.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                      <td className="py-2.5 px-4 text-neutral-500 dark:text-neutral-400">
                        {new Date(t.executedAt).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-4 text-neutral-700 dark:text-neutral-300">{t.tradeReference}</td>
                      <td className="py-2.5 px-4 font-bold text-neutral-900 dark:text-white">{t.symbol}</td>
                      <td className="py-2.5 px-4 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                        {formatCurrency(t.price)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-neutral-700 dark:text-neutral-300">{t.quantity}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-neutral-900 dark:text-neutral-100">
                        {formatCurrency(t.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Rules & Participants */}
      {activeTab === 'RULES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] p-6 rounded-2xl space-y-4 shadow-sm">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white font-mono flex items-center gap-2">
              <Shield className="w-5 h-5 text-neutral-900 dark:text-white" />
              Tournament Governance & Rules
            </h3>

            <div className="space-y-3 text-xs text-neutral-700 dark:text-neutral-300">
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-1">
                <span className="font-bold text-neutral-900 dark:text-white block">Strict Portfolio Isolation</span>
                <p className="text-neutral-500 dark:text-neutral-400">
                  Every participant trades with a dedicated virtual capital balance allocated specifically for this competition. Your regular wallet and portfolio positions are completely untouched.
                </p>
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-1">
                <span className="font-bold text-neutral-900 dark:text-white block">Server-Authoritative Ranking Formula</span>
                <p className="text-neutral-500 dark:text-neutral-400 font-mono text-[11px]">
                  Total Return % = ((Available Cash + Reserved Cash + Holdings Market Value) - Starting Capital) / Starting Capital * 100
                </p>
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-1">
                <span className="font-bold text-neutral-900 dark:text-white block">Deterministic Tie-Breakers</span>
                <ol className="list-decimal list-inside text-neutral-500 dark:text-neutral-400 space-y-0.5">
                  <li>Total Return Percentage (descending)</li>
                  <li>Realized PnL (descending)</li>
                  <li>Trade Count (descending)</li>
                  <li>Joined Timestamp (ascending)</li>
                </ol>
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 space-y-1">
                <span className="font-bold text-neutral-900 dark:text-white block">Permitted Order Types</span>
                <p className="text-neutral-500 dark:text-neutral-400 font-mono">
                  {competition.permittedOrderTypes ? competition.permittedOrderTypes.join(', ') : 'LIMIT, MARKET'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] p-6 rounded-2xl space-y-4 shadow-sm">
            <h3 className="text-base font-bold text-neutral-900 dark:text-white font-mono flex items-center gap-2">
              <Users className="w-5 h-5 text-neutral-900 dark:text-white" />
              Registered Competitors ({participants.length})
            </h3>

            <div className="max-h-96 overflow-y-auto divide-y divide-neutral-200 dark:divide-neutral-800">
              {participants.map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-900 dark:text-white font-medium">{p.username}</span>
                    {p.userId === competition.creatorId && (
                      <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold">
                        HOST
                      </span>
                    )}
                  </div>
                  <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">
                    Joined {new Date(p.joinedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
