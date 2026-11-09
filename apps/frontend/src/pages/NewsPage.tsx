import React, { useState, useEffect, useCallback } from 'react';
import {
  NewsArticle,
  ActiveCatalystSummary,
  NewsCategory,
  NewsImpactDirection,
} from '@tradegrid/shared-types';
import { newsApiService } from '../services/news.service';
import { socketService } from '../services/socket.service';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { formatDate } from '../utils/formatters';
import {
  Newspaper,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Radio,
  Search,
  Filter,
  RefreshCw,
} from 'lucide-react';

const CATEGORIES: NewsCategory[] = [
  'Earnings',
  'Revenue',
  'Management',
  'Product Launch',
  'Partnership',
  'Regulatory',
  'Legal',
  'Economic',
  'Industry',
  'Competition',
  'Crisis',
  'Market Sentiment',
  'Other',
];

export const NewsPage: React.FC = () => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [activeCatalysts, setActiveCatalysts] = useState<ActiveCatalystSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedDirection, setSelectedDirection] = useState<string>('ALL');

  const fetchNewsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [newsRes, catalystsRes] = await Promise.allSettled([
        newsApiService.getNews({
          limit: 50,
          category: selectedCategory !== 'ALL' ? (selectedCategory as NewsCategory) : undefined,
          impactDirection: selectedDirection !== 'ALL' ? (selectedDirection as NewsImpactDirection) : undefined,
          search: searchQuery.trim() || undefined,
        }),
        newsApiService.getActiveCatalysts(),
      ]);

      if (newsRes.status === 'fulfilled') {
        setArticles(newsRes.value.articles || []);
      }
      if (catalystsRes.status === 'fulfilled') {
        setActiveCatalysts(catalystsRes.value || []);
      }
    } catch (err) {
      console.error('Failed to load simulated news feed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, selectedDirection, searchQuery]);

  useEffect(() => {
    fetchNewsData();
  }, [fetchNewsData]);

  // Real-time WebSocket subscriptions for news
  useEffect(() => {
    socketService.connect();
    socketService.subscribe('news');

    const handleNewsPublished = () => {
      fetchNewsData();
    };

    const handleNewsUpdated = () => {
      fetchNewsData();
    };

    const handleNewsExpired = () => {
      fetchNewsData();
    };

    socketService.on('news:published', handleNewsPublished);
    socketService.on('news:updated', handleNewsUpdated);
    socketService.on('news:expired', handleNewsExpired);
    socketService.on('news:catalyst:started', handleNewsUpdated);
    socketService.on('news:catalyst:completed', handleNewsExpired);

    return () => {
      socketService.off('news:published', handleNewsPublished);
      socketService.off('news:updated', handleNewsUpdated);
      socketService.off('news:expired', handleNewsExpired);
      socketService.off('news:catalyst:started', handleNewsUpdated);
      socketService.off('news:catalyst:completed', handleNewsExpired);
      socketService.unsubscribe('news');
    };
  }, [fetchNewsData]);

  const renderImpactBadge = (direction: NewsImpactDirection, sentiment?: string) => {
    const isBullish = direction === 'POSITIVE';
    const isBearish = direction === 'NEGATIVE';

    if (isBullish) {
      return (
        <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-[11px] font-semibold bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
          <TrendingUp className="w-3 h-3" />
          +{sentiment || '0.00'}
        </span>
      );
    }
    if (isBearish) {
      return (
        <span className="inline-flex items-center gap-1 text-rose-400 font-mono text-[11px] font-semibold bg-rose-950/40 border border-rose-800/40 px-2 py-0.5 rounded">
          <TrendingDown className="w-3 h-3" />
          {sentiment || '-0.00'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[11px] font-semibold bg-slate-800/40 border border-slate-700/40 px-2 py-0.5 rounded">
        {sentiment || '0.00'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Prominent Educational Disclaimer Banner */}
      <div className="bg-purple-950/40 border border-purple-800/40 p-4 rounded-xl flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-purple-300">
              SIMULATED NEWS WIRE — NOT REAL FINANCIAL NEWS
            </span>
            <Badge variant="simulated">100% SYNTHETIC</Badge>
          </div>
          <p className="text-xs text-purple-200/80 leading-relaxed">
            All news stories, headlines, company figures, and market catalyst events on this wire are <strong>100% synthetic and computer-generated</strong> for market simulation exercises. They do not describe or represent any real-world companies or events.
          </p>
        </div>
      </div>

      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-slate-900 dark:text-white" />
            Simulated Market News & Catalyst Wire
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time simulated breaking news headlines driving participant psychology, market-making bots, and order book momentum.
          </p>
        </div>

        <button
          onClick={fetchNewsData}
          disabled={isLoading}
          className="self-start md:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Wire
        </button>
      </div>

      {/* Active Catalysts Live Banner */}
      {activeCatalysts.length > 0 && (
        <div className="bg-slate-900/80 border border-emerald-800/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-xs font-bold font-mono text-emerald-400 uppercase tracking-wider">
                Live Active Market Catalysts ({activeCatalysts.length})
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              Affecting bot spreads and reservation pricing
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeCatalysts.map((cat) => (
              <div
                key={cat.catalystId}
                className="bg-slate-950/80 border border-emerald-900/30 p-3 rounded-lg space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-emerald-300 font-medium truncate max-w-[180px]">
                    {cat.targetScope === 'INSTRUMENT' && cat.targetSymbol ? `$${cat.targetSymbol}` : cat.targetScope}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Decay: {cat.decayRemainingPercent}%
                  </span>
                </div>

                <p className="text-[11px] text-slate-300 font-semibold truncate">
                  {cat.headline}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-800/60">
                  <span>Impact: {cat.effectiveImpact}</span>
                  <span>Vol: {cat.volatilityFactor}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search headlines or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={selectedDirection}
            onChange={(e) => setSelectedDirection(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Directions</option>
            <option value="POSITIVE">Positive</option>
            <option value="NEGATIVE">Negative</option>
            <option value="NEUTRAL">Neutral</option>
          </select>
        </div>
      </div>

      {/* News Stream Feed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {articles.length === 0 ? (
          <div className="col-span-2 text-center py-16 text-slate-500 text-xs">
            No simulated news stories found matching the current search criteria.
          </div>
        ) : (
          articles.map((item) => {
            return (
              <Card
                key={item.id}
                className="hover:border-slate-700 transition-all duration-200 bg-slate-900/60 border-slate-800"
              >
                <div className="space-y-3">
                  {/* Meta header */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant="simulated">SIMULATED</Badge>
                      <span className="text-[11px] text-slate-400 font-medium">{item.category}</span>
                    </div>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                      <Clock className="w-3 h-3" /> {formatDate(item.publishedAt || item.createdAt)}
                    </span>
                  </div>

                  {/* Headline */}
                  <h3 className="text-sm font-semibold text-slate-100 hover:text-cyan-300 cursor-pointer transition-colors leading-snug">
                    {item.headline}
                  </h3>

                  {/* Summary */}
                  <p className="text-xs text-slate-400 leading-relaxed">{item.summary}</p>

                  {/* Impact Tags and Affected Target */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">Scope:</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-[10px] font-semibold border border-slate-700">
                        {item.targetScope}
                        {item.targetSymbol && ` ($${item.targetSymbol})`}
                        {item.targetSector && ` (${item.targetSector})`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.catalyst && (
                        <>
                          {renderImpactBadge(item.impactDirection, item.catalyst.sentimentScore)}
                          <span className="text-[10px] font-mono text-purple-300 bg-purple-950/40 border border-purple-800/40 px-1.5 py-0.5 rounded">
                            Vol {item.catalyst.volatilityFactor}x
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Educational Architecture Rationale */}
      <Card title="How Simulated Catalysts Drive Market Flow (Phase 5C)">
        <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
          <p>
            In TRADEGRID Phase 5C, simulated news events introduce realistic sentiment shifts and volatility shocks across instruments, sectors, and the broader market.
          </p>
          <p>
            Rather than artificially overriding prices, catalyst parameters feed deterministically into the <strong>Avellaneda-Stoikov market maker bots</strong>. Bids and asks widen during volatile breaking news to manage inventory risk, while positive or negative sentiment skews reservation prices. All trades and order executions continue to occur strictly through the central matching engine with atomic wallet and ledger settlement.
          </p>
        </div>
      </Card>
    </div>
  );
};
