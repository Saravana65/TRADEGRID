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
import { formatISTDate } from '../utils/formatters';
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
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
          <TrendingUp className="w-3 h-3" />
          +{sentiment || '0.00'}
        </span>
      );
    }
    if (isBearish) {
      return (
        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-mono text-[11px] font-semibold bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
          <TrendingDown className="w-3 h-3" />
          {sentiment || '-0.00'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400 font-mono text-[11px] font-semibold bg-neutral-100 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] px-2 py-0.5 rounded">
        {sentiment || '0.00'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Simulation Disclaimer Banner */}
      <div className="bg-neutral-100 dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] p-4 rounded-xl flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-neutral-600 dark:text-neutral-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-neutral-900 dark:text-white">
              SIMULATED NEWS WIRE — 100% SYNTHETIC
            </span>
            <Badge variant="simulated">SIMULATOR</Badge>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            All news stories, headlines, company figures, and market catalyst events on this wire are <strong>100% synthetic and computer-generated</strong> for market simulation exercises. They do not describe or represent any real-world companies or events.
          </p>
        </div>
      </div>

      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-neutral-900 dark:text-white" />
            Simulated Market News & Catalyst Wire
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Real-time simulated breaking news headlines driving participant psychology, market-making bots, and order book momentum.
          </p>
        </div>

        <button
          onClick={fetchNewsData}
          disabled={isLoading}
          className="self-start md:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] text-xs text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-[#141414] transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Wire
        </button>
      </div>

      {/* Active Catalysts Live Banner */}
      {activeCatalysts.length > 0 && (
        <div className="bg-white dark:bg-[#0A0A0A] border border-emerald-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
              <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Live Active Market Catalysts ({activeCatalysts.length})
              </span>
            </div>
            <span className="text-[11px] text-neutral-500">
              Affecting bot spreads and reservation pricing
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeCatalysts.map((cat) => (
              <div
                key={cat.catalystId}
                className="bg-neutral-50 dark:bg-[#141414] border border-emerald-500/20 p-3 rounded-lg space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[180px]">
                    {cat.targetScope === 'INSTRUMENT' && cat.targetSymbol ? `$${cat.targetSymbol}` : cat.targetScope}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-500">
                    Decay: {cat.decayRemainingPercent}%
                  </span>
                </div>

                <p className="text-[11px] text-neutral-900 dark:text-white font-semibold truncate">
                  {cat.headline}
                </p>

                <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono pt-1 border-t border-neutral-200 dark:border-[#1F1F1F]">
                  <span>Impact: {cat.effectiveImpact}</span>
                  <span>Vol: {cat.volatilityFactor}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-[#0A0A0A] p-3 rounded-xl border border-neutral-200 dark:border-[#1F1F1F]">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search headlines or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg pl-9 pr-3 py-1.5 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-neutral-400" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
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
            className="bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
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
          <div className="col-span-2 text-center py-16 text-neutral-500 text-xs">
            No simulated news stories found matching the current search criteria.
          </div>
        ) : (
          articles.map((item) => {
            return (
              <Card
                key={item.id}
                className="hover:border-neutral-300 dark:hover:border-neutral-700 transition-all duration-200 bg-white dark:bg-[#0A0A0A] border-neutral-200 dark:border-[#1F1F1F]"
              >
                <div className="space-y-3">
                  {/* Meta header */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant="simulated">SIMULATED</Badge>
                      <span className="text-[11px] text-neutral-500 font-medium">{item.category}</span>
                    </div>
                    <span className="flex items-center gap-1 text-[11px] text-neutral-500 font-mono">
                      <Clock className="w-3 h-3" /> {formatISTDate(item.publishedAt || item.createdAt)}
                    </span>
                  </div>

                  {/* Headline */}
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">
                    {item.headline}
                  </h3>

                  {/* Summary */}
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">{item.summary}</p>

                  {/* Impact Tags and Affected Target */}
                  <div className="pt-2 border-t border-neutral-200 dark:border-[#1F1F1F] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-neutral-500">Scope:</span>
                      <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-[#141414] text-neutral-900 dark:text-white font-mono text-[10px] font-semibold border border-neutral-200 dark:border-[#1F1F1F]">
                        {item.targetScope}
                        {item.targetSymbol && ` ($${item.targetSymbol})`}
                        {item.targetSector && ` (${item.targetSector})`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.catalyst && (
                        <>
                          {renderImpactBadge(item.impactDirection, item.catalyst.sentimentScore)}
                          <span className="text-[10px] font-mono text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] px-1.5 py-0.5 rounded">
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
      <Card title="How Simulated Catalysts Drive Market Flow (Phase 5C)" className="bg-white dark:bg-[#0A0A0A] border-neutral-200 dark:border-[#1F1F1F]">
        <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-2 leading-relaxed">
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
