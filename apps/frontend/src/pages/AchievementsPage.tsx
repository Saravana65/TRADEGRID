import React, { useState, useEffect } from 'react';
import {
  AchievementCategory,
  UserAchievementItem,
  UserAchievementStats,
  AchievementLeaderboardEntry,
  AchievementUnlockedEvent,
} from '@tradegrid/shared-types';
import { achievementApiService } from '../services/achievement.service';
import { socketService } from '../services/socket.service';
import { useAuthStore } from '../store/authStore';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { formatDate } from '../utils/formatters';
import {
  Trophy,
  Award,
  Crown,
  Medal,
  Swords,
  Zap,
  Flame,
  Activity,
  Cpu,
  Layers,
  FlaskConical,
  Shield,
  TrendingUp,
  BarChart2,
  PieChart,
  Sliders,
  LineChart,
  Sparkles,
  MessageSquare,
  Lock,
  CheckCircle2,
  Users,
  Target,
  Info,
} from 'lucide-react';

// Dynamic icon mapper for achievement definitions
const ICON_MAP: Record<string, React.ElementType> = {
  Cpu,
  Layers,
  Activity,
  FlaskConical,
  Shield,
  Trophy,
  Swords,
  Medal,
  Award,
  Crown,
  Zap,
  TrendingUp,
  BarChart2,
  Flame,
  PieChart,
  Sliders,
  LineChart,
  Sparkles,
  MessageSquare,
};

function renderBadgeIcon(iconName: string, className: string = 'w-6 h-6') {
  const IconComponent = ICON_MAP[iconName] || Award;
  return <IconComponent className={className} />;
}

export const AchievementsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [activeCategory, setActiveCategory] = useState<AchievementCategory | 'ALL'>('ALL');
  const [activeTab, setActiveTab] = useState<'catalog' | 'leaderboard'>('catalog');
  const [stats, setStats] = useState<UserAchievementStats | null>(null);
  const [achievements, setAchievements] = useState<UserAchievementItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<AchievementLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [recentUnlock, setRecentUnlock] = useState<AchievementUnlockedEvent | null>(null);

  // Load initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsData, catalogData, leaderboardData] = await Promise.all([
        achievementApiService.getUserStats(),
        achievementApiService.getUserAchievements(),
        achievementApiService.getLeaderboard(20),
      ]);
      setStats(statsData);
      setAchievements(catalogData);
      setLeaderboard(leaderboardData);
    } catch (err) {
      console.error('Failed to load achievement data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen for real-time achievement unlocks
    socketService.connect();
    const handleUnlock = (event: AchievementUnlockedEvent) => {
      setRecentUnlock(event);
      // Auto-dismiss notification after 8 seconds
      setTimeout(() => {
        setRecentUnlock((prev) => (prev?.achievement.code === event.achievement.code ? null : prev));
      }, 8000);
      // Refresh stats & catalog
      fetchData();
    };

    socketService.on('achievement:unlocked', handleUnlock);

    return () => {
      socketService.off('achievement:unlocked', handleUnlock);
    };
  }, []);

  // Filter achievements by category
  const filteredAchievements = achievements.filter((a) => {
    if (activeCategory === 'ALL') return true;
    return a.category === activeCategory;
  });

  // Calculate stats by category
  const categories: Array<{ id: AchievementCategory | 'ALL'; label: string }> = [
    { id: 'ALL', label: 'All Badges' },
    { id: 'TRADING', label: 'Trading Execution' },
    { id: 'BACKTESTING', label: 'Quant & Backtesting' },
    { id: 'COMPETITION', label: 'Multiplayer Arena' },
    { id: 'LEARNING', label: 'Learning & Community' },
  ];

  return (
    <div className="space-y-6">
      {/* Real-time Achievement Celebration Banner */}
      {recentUnlock && (
        <div className="bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border border-amber-500/50 p-4 rounded-xl shadow-lg shadow-amber-500/10 flex items-center justify-between animate-bounce">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/30 text-amber-300 rounded-lg border border-amber-400/40">
              <Trophy className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-wider uppercase text-amber-400">
                  Achievement Unlocked!
                </span>
                <Badge variant="gain">+{recentUnlock.pointsAwarded} XP</Badge>
              </div>
              <h3 className="text-sm font-bold text-white mt-0.5">
                {recentUnlock.achievement.name}
              </h3>
              <p className="text-xs text-slate-300">{recentUnlock.achievement.description}</p>
            </div>
          </div>
          <button
            onClick={() => setRecentUnlock(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800/60"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Hero Header & Level Progression Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0E1528] via-[#131D38] to-[#0E1528] border border-cyan-500/20 p-6 shadow-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-8 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 via-cyan-500/20 to-indigo-500/20 border-2 border-cyan-400/40 flex flex-col items-center justify-center shadow-lg shadow-cyan-500/10">
                <Crown className="w-8 h-8 text-amber-400 mb-0.5" />
                <span className="font-mono text-xs font-black tracking-wider text-cyan-300 uppercase">
                  LVL {stats?.currentLevel || 1}
                </span>
              </div>
              <div className="absolute -bottom-2 -right-2 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded-full text-[10px] font-mono font-bold text-slate-300">
                #{stats?.levelTitle ? stats.levelTitle.split(' ')[0] : 'Trader'}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {user?.username}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border border-amber-500/40">
                  {stats?.levelTitle || 'Novice Trader'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Server-authoritative trader progression. Earn non-monetary gamification badges
                across backtesting, trading, competitions, and technical learning.
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs font-mono text-slate-300">
                <div>
                  <span className="text-slate-500">Total Points: </span>
                  <span className="font-bold text-amber-400">{stats?.totalPoints || 0} XP</span>
                </div>
                <div>
                  <span className="text-slate-500">Badges Unlocked: </span>
                  <span className="font-bold text-cyan-400">
                    {stats?.achievementsUnlockedCount || 0} / {stats?.totalAchievementsCount || 19} (
                    {stats?.completionPercent || 0}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* XP Progress Bar to Next Level */}
          <div className="w-full md:w-80 bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-slate-400 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-cyan-400" /> Next Level Milestone
              </span>
              <span className="font-mono font-bold text-cyan-300">
                Level {(stats?.currentLevel || 1) + 1}
              </span>
            </div>

            {/* Progress Track */}
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700/50">
              <div
                className="bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 h-full rounded-full transition-all duration-700"
                style={{ width: `${stats?.currentLevelProgressPercent || 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2">
              <span>{stats?.currentLevelProgressPercent || 0}% Progress</span>
              <span className="text-amber-400">
                {stats?.pointsToNextLevel || 100} XP to Level Up
              </span>
            </div>
          </div>
        </div>

        {/* Gamification Disclaimer */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400">
          <Info className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <span>
            Strict Financial Invariant: Achievement points and rank titles are strictly for virtual
            gamification and recognition. They do not alter your virtual cash wallet, order margins,
            or execution priority.
          </span>
        </div>
      </div>

      {/* Tabs & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Main View Tab Selector */}
        <div className="flex items-center bg-slate-900/80 border border-card-border p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'catalog'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Award className="w-4 h-4" />
            Achievements Catalog ({achievements.length})
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'leaderboard'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            Hall of Fame Leaderboard
          </button>
        </div>

        {/* Category Filters (Visible only in catalog view) */}
        {activeTab === 'catalog' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {categories.map((c) => {
              const count =
                c.id === 'ALL'
                  ? achievements.length
                  : achievements.filter((a) => a.category === c.id).length;
              const unlockedInCategory =
                c.id === 'ALL'
                  ? achievements.filter((a) => a.isUnlocked).length
                  : achievements.filter((a) => a.category === c.id && a.isUnlocked).length;

              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                    activeCategory === c.id
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                      : 'bg-card border-card-border text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {c.label} ({unlockedInCategory}/{count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-20 text-center text-slate-500 font-mono text-sm">
          Loading achievement subsystem...
        </div>
      ) : activeTab === 'catalog' ? (
        /* Achievements Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAchievements.map((item) => {
            const isUnlocked = item.isUnlocked;
            const progress = item.currentProgress || 0;
            const required = item.requiredProgress || 1;
            const progressPct = Math.min(100, Math.round((progress / required) * 100));

            return (
              <div
                key={item.code}
                className={`relative rounded-xl p-5 border transition-all duration-200 flex flex-col justify-between ${
                  isUnlocked
                    ? 'bg-gradient-to-b from-[#131B2E] to-[#0D1424] border-amber-500/40 shadow-lg shadow-amber-500/5 hover:border-amber-400/60'
                    : 'bg-card/70 border-card-border hover:border-slate-700 opacity-90'
                }`}
              >
                <div>
                  {/* Top Row: Category & Points Badge */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                        item.category === 'TRADING'
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                          : item.category === 'BACKTESTING'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                          : item.category === 'COMPETITION'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {item.category}
                    </span>
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                        isUnlocked
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      +{item.points} XP
                    </span>
                  </div>

                  {/* Icon & Title */}
                  <div className="flex items-start gap-3.5 mb-2.5">
                    <div
                      className={`p-3 rounded-xl border flex-shrink-0 ${
                        isUnlocked
                          ? 'bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border-amber-400/50 text-amber-300 shadow-md shadow-amber-500/10'
                          : 'bg-slate-800/80 border-slate-700 text-slate-500'
                      }`}
                    >
                      {renderBadgeIcon(item.badgeIcon, 'w-6 h-6')}
                    </div>
                    <div>
                      <h4
                        className={`text-sm font-bold leading-tight ${
                          isUnlocked ? 'text-white' : 'text-slate-300'
                        }`}
                      >
                        {item.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bottom Status / Progress Section */}
                <div className="mt-4 pt-3 border-t border-card-border/60">
                  {isUnlocked ? (
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-4 h-4" /> Unlocked
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {item.unlockedAt ? formatDate(item.unlockedAt) : 'Earned'}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-slate-500" /> In Progress
                        </span>
                        <span className="text-slate-300 font-bold">
                          {progress} / {required} ({progressPct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-cyan-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Global Leaderboard View */
        <Card
          title="Global Trader Hall of Fame"
          subtitle="Top traders ranked strictly by verified achievement XP points and activity"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-[#0D1322] text-xs font-mono uppercase text-slate-400 border-b border-card-border">
                <tr>
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Trader</th>
                  <th className="py-3 px-4">Rank Title</th>
                  <th className="py-3 px-4 text-center">Level</th>
                  <th className="py-3 px-4 text-center">Badges Unlocked</th>
                  <th className="py-3 px-4 text-right">Total XP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/60 font-mono text-xs">
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No leaderboard entries recorded yet.
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((entry) => {
                    const isCurrentUser = entry.userId === user?.id;
                    return (
                      <tr
                        key={entry.userId}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          isCurrentUser
                            ? 'bg-cyan-500/10 font-bold text-white border-l-2 border-cyan-400'
                            : ''
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            {entry.rank === 1 ? (
                              <span className="p-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                <Crown className="w-4 h-4 text-amber-400" />
                              </span>
                            ) : entry.rank === 2 ? (
                              <span className="p-1 rounded bg-slate-300/20 text-slate-200 border border-slate-300/40">
                                <Medal className="w-4 h-4 text-slate-300" />
                              </span>
                            ) : entry.rank === 3 ? (
                              <span className="p-1 rounded bg-amber-700/20 text-amber-600 border border-amber-700/40">
                                <Award className="w-4 h-4 text-amber-600" />
                              </span>
                            ) : (
                              <span className="text-slate-500 font-bold ml-1.5">
                                #{entry.rank}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-sans font-semibold text-slate-200">
                          <div className="flex items-center gap-2">
                            <span>{entry.username}</span>
                            {isCurrentUser && <Badge variant="cyan">You</Badge>}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-sans text-slate-400">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[11px]">
                            {entry.levelTitle}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-bold text-cyan-400">LVL {entry.currentLevel}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-slate-300">
                          {entry.achievementsUnlockedCount} Badges
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-bold text-amber-400 text-sm">
                            {entry.totalPoints} XP
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
