import React, { useState, useEffect, useCallback } from 'react';
import {
  NewsArticle,
  NewsMetricsSummary,
  NewsCatalystExecution,
  NewsCategory,
  NewsSeverity,
  NewsTargetScope,
  NewsImpactDirection,
} from '@tradegrid/shared-types';
import { CreateNewsInput } from '@tradegrid/validation';
import { newsApiService } from '../../services/news.service';
import { marketApiService } from '../../services/market.service';
import { socketService } from '../../services/socket.service';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { formatISTDate } from '../../utils/formatters';
import {
  Newspaper,
  Play,
  XCircle,
  RefreshCw,
  Plus,
  FileText,
  Radio,
  Search,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  X,
  CheckCircle2,
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

type PublishMode = 'IMMEDIATE' | 'SCHEDULED' | 'DRAFT';

export const AdminNewsTab: React.FC = () => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [metrics, setMetrics] = useState<NewsMetricsSummary | null>(null);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Create News Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishMode, setPublishMode] = useState<PublishMode>('IMMEDIATE');
  const [scheduledDateTime, setScheduledDateTime] = useState('');

  const [createForm, setCreateForm] = useState<CreateNewsInput>({
    headline: '',
    summary: '',
    content: '',
    category: 'Product Launch',
    impactDirection: 'POSITIVE',
    severity: 'HIGH',
    targetScope: 'INSTRUMENT',
    targetSymbol: 'RELIANCE',
    targetSector: '',
    publishImmediately: true,
    catalyst: {
      sentimentScore: '0.8000',
      volatilityFactor: '1.5000',
      expectedParticipation: '1.3000',
      durationSeconds: 300,
    },
  });

  // Audit Log Modal State
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [executions, setExecutions] = useState<NewsCatalystExecution[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  const fetchNewsAndMetrics = useCallback(async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const [newsData, metricsData, instData] = await Promise.allSettled([
        newsApiService.getNews({
          limit: 100,
          category: categoryFilter !== 'ALL' ? (categoryFilter as NewsCategory) : undefined,
          status: statusFilter !== 'ALL' ? (statusFilter as any) : undefined,
          search: searchQuery.trim() || undefined,
        }),
        newsApiService.getAdminMetrics(),
        marketApiService.getInstruments({ limit: 100 }),
      ]);

      if (newsData.status === 'fulfilled') {
        setArticles(newsData.value.articles || []);
      }
      if (metricsData.status === 'fulfilled') {
        setMetrics(metricsData.value);
      }
      if (instData.status === 'fulfilled') {
        const symList = (instData.value.instruments || []).map((i: any) => i.symbol);
        setSymbols(symList);
        if (symList.length > 0) {
          setCreateForm((prev) => {
            if (!prev.targetSymbol || !symList.includes(prev.targetSymbol)) {
              return { ...prev, targetSymbol: symList[0] };
            }
            return prev;
          });
        }
      }
    } catch (err: any) {
      setActionError(`Failed to load news data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [categoryFilter, statusFilter, searchQuery]);

  useEffect(() => {
    fetchNewsAndMetrics();
  }, [fetchNewsAndMetrics]);

  // Real-time WebSocket subscriptions
  useEffect(() => {
    socketService.connect();
    socketService.subscribe('news');
    socketService.subscribe('admin:news');

    const handleNewsPublished = () => {
      fetchNewsAndMetrics();
    };

    const handleNewsUpdated = () => {
      fetchNewsAndMetrics();
    };

    const handleNewsExpired = () => {
      fetchNewsAndMetrics();
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
      socketService.unsubscribe('admin:news');
    };
  }, [fetchNewsAndMetrics]);

  const handleCreateNews = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setActionError(null);
    try {
      const payload: CreateNewsInput = {
        ...createForm,
        publishImmediately: publishMode === 'IMMEDIATE',
        scheduledAt: publishMode === 'SCHEDULED' && scheduledDateTime ? new Date(scheduledDateTime).toISOString() : undefined,
      };

      await newsApiService.createNews(payload);
      setShowCreateModal(false);
      setActionNotice(
        publishMode === 'IMMEDIATE'
          ? `Simulated news "${payload.headline}" published and catalyst activated!`
          : publishMode === 'SCHEDULED'
          ? `Simulated news "${payload.headline}" scheduled successfully.`
          : `Simulated news "${payload.headline}" saved as draft.`
      );
      // Reset form
      setCreateForm((prev) => ({
        ...prev,
        headline: '',
        summary: '',
        content: '',
      }));
      fetchNewsAndMetrics();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error?.message || err.message;
      setActionError(`Failed to create simulated news: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublish = async (id: number) => {
    setActionError(null);
    try {
      await newsApiService.publishNews(id);
      setActionNotice(`News #${id} published and catalyst activated immediately.`);
      fetchNewsAndMetrics();
    } catch (err: any) {
      setActionError(`Failed to publish news #${id}: ${err.message}`);
    }
  };

  const handleCancel = async (id: number) => {
    setActionError(null);
    try {
      await newsApiService.cancelNews(id);
      setActionNotice(`News #${id} cancelled and catalyst halted.`);
      fetchNewsAndMetrics();
    } catch (err: any) {
      setActionError(`Failed to cancel news #${id}: ${err.message}`);
    }
  };

  const handleOpenAudit = async (article: NewsArticle) => {
    setSelectedArticle(article);
    setShowAuditModal(true);
    setIsLoadingAudit(true);
    try {
      const res = await newsApiService.getExecutions(article.id);
      setExecutions(res.executions || []);
    } catch (err: any) {
      setActionError(`Failed to load audit logs for news #${article.id}: ${err.message}`);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="gain">LIVE CATALYST</Badge>;
      case 'SCHEDULED':
        return <Badge variant="neutral">SCHEDULED</Badge>;
      case 'DRAFT':
        return <Badge variant="neutral">DRAFT</Badge>;
      case 'EXPIRED':
        return <Badge variant="loss">EXPIRED</Badge>;
      case 'CANCELLED':
        return <Badge variant="loss">CANCELLED</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const renderImpactBadge = (direction: NewsImpactDirection, score?: string) => {
    const isBullish = direction === 'POSITIVE';
    const isBearish = direction === 'NEGATIVE';

    if (isBullish) {
      return (
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
          <TrendingUp className="w-3 h-3" />
          +{score || '0.00'}
        </span>
      );
    }
    if (isBearish) {
      return (
        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-mono text-xs font-semibold bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
          <TrendingDown className="w-3 h-3" />
          {score || '-0.00'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-400 font-mono text-xs font-semibold bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 px-2 py-0.5 rounded">
        {score || '0.00'}
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
              ADMIN NEWS & CATALYST CONTROL CENTER
            </span>
            <Badge variant="simulated">SIMULATOR ENGINE</Badge>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            All news headlines injected here are synthetic financial shock catalysts. Publishing an article immediately shifts market sentiment, influences autonomous bot trading aggression, and triggers order book volatility.
          </p>
        </div>
      </div>

      {/* Action Notice */}
      {actionNotice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Message */}
      {actionError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between text-xs text-rose-700 dark:text-rose-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-[#0A0A0A] border-neutral-200 dark:border-[#1F1F1F]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Total Stories</p>
              <p className="text-2xl font-bold font-mono text-neutral-900 dark:text-white mt-1">
                {metrics?.totalArticles ?? articles.length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] flex items-center justify-center">
              <Newspaper className="w-5 h-5 text-neutral-900 dark:text-white" />
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-[#0A0A0A] border-neutral-200 dark:border-[#1F1F1F]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Active Catalysts</p>
              <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {metrics?.activeCatalysts ?? articles.filter((a) => a.status === 'ACTIVE').length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Radio className="w-5 h-5 text-emerald-500 animate-pulse" />
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-[#0A0A0A] border-neutral-200 dark:border-[#1F1F1F]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Scheduled Articles</p>
              <p className="text-2xl font-bold font-mono text-neutral-900 dark:text-white mt-1">
                {metrics?.scheduledArticles ?? articles.filter((a) => a.status === 'SCHEDULED').length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] flex items-center justify-center">
              <Clock className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
            </div>
          </div>
        </Card>

        <Card className="bg-white dark:bg-[#0A0A0A] border-neutral-200 dark:border-[#1F1F1F]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Expired Catalysts</p>
              <p className="text-2xl font-bold font-mono text-neutral-500 dark:text-neutral-400 mt-1">
                {metrics?.expiredArticles ?? articles.filter((a) => a.status === 'EXPIRED').length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] flex items-center justify-center">
              <Clock className="w-5 h-5 text-neutral-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Controls & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search news headline..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg pl-9 pr-3 py-1.5 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
          >
            <option value="ALL">All Categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">ACTIVE (Live)</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="DRAFT">DRAFT</option>
            <option value="EXPIRED">EXPIRED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchNewsAndMetrics}
            disabled={isLoading}
            className="border-neutral-200 dark:border-[#1F1F1F] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#141414]"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-black dark:hover:bg-neutral-200 font-medium"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create Simulated News
          </Button>
        </div>
      </div>

      {/* News Articles Grid / List */}
      <div className="space-y-3">
        {articles.length === 0 ? (
          <Card className="text-center py-12 text-neutral-500 bg-white dark:bg-[#0A0A0A] border-neutral-200 dark:border-[#1F1F1F]">
            <Newspaper className="w-8 h-8 mx-auto text-neutral-400 mb-2" />
            <p className="text-sm">No simulated news articles found matching the current filters.</p>
            <p className="text-xs text-neutral-400 mt-1">
              Click &quot;Create Simulated News&quot; above to create a catalyst event.
            </p>
          </Card>
        ) : (
          articles.map((item) => (
            <Card
              key={item.id}
              className={`bg-white dark:bg-[#0A0A0A] border ${
                item.status === 'ACTIVE'
                  ? 'border-emerald-500/40 ring-1 ring-emerald-500/20'
                  : 'border-neutral-200 dark:border-[#1F1F1F]'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {renderStatusBadge(item.status)}
                    <Badge variant="simulated">SIMULATED</Badge>
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] px-2 py-0.5 rounded text-[11px]">
                      {item.category}
                    </span>
                    <span className="text-neutral-500 text-[11px]">
                      Scope: <strong className="text-neutral-900 dark:text-white font-mono">{item.targetScope}</strong>
                      {item.targetSymbol && (
                        <span className="text-neutral-900 dark:text-white font-semibold"> ({item.targetSymbol})</span>
                      )}
                      {item.targetSector && (
                        <span> ({item.targetSector})</span>
                      )}
                    </span>
                    {item.catalyst && (
                      <div className="flex items-center gap-2 ml-auto">
                        {renderImpactBadge(item.impactDirection, item.catalyst.sentimentScore)}
                        <span className="text-[11px] font-mono text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] px-2 py-0.5 rounded">
                          Vol: {item.catalyst.volatilityFactor}x
                        </span>
                      </div>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">
                    {item.headline}
                  </h3>

                  <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    {item.summary}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-neutral-500 pt-1">
                    {item.publishedAt && (
                      <span>Published: {formatISTDate(item.publishedAt)}</span>
                    )}
                    {item.scheduledAt && item.status === 'SCHEDULED' && (
                      <span className="font-mono text-neutral-700 dark:text-neutral-300">
                        Scheduled for: {formatISTDate(item.scheduledAt)}
                      </span>
                    )}
                    {item.expiresAt && item.status === 'ACTIVE' && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                        Expires: {formatISTDate(item.expiresAt)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Article Action Controls */}
                <div className="flex items-center gap-2 self-start md:self-center">
                  {(item.status === 'DRAFT' || item.status === 'SCHEDULED') && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handlePublish(item.id)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-7 px-2.5"
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Publish Now
                    </Button>
                  )}

                  {item.status === 'ACTIVE' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCancel(item.id)}
                      className="border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs h-7 px-2.5"
                    >
                      <XCircle className="w-3 h-3 mr-1" />
                      Cancel Catalyst
                    </Button>
                  )}

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenAudit(item)}
                    className="border-neutral-200 dark:border-[#1F1F1F] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#141414] text-xs h-7 px-2.5"
                  >
                    <FileText className="w-3 h-3 mr-1" />
                    Audit Logs
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Modal: Create Simulated News */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-[#1F1F1F] pb-3">
              <div className="flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-neutral-900 dark:text-white" />
                <h3 className="font-semibold text-neutral-900 dark:text-white text-sm">
                  Create Simulated News Catalyst
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNews} className="space-y-4 text-xs">
              <div>
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">
                  News Headline *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RELIANCE Announces Major Clean Energy Technology Breakthrough"
                  value={createForm.headline}
                  onChange={(e) => setCreateForm({ ...createForm, headline: e.target.value })}
                  className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-3 py-2 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400"
                />
              </div>

              <div>
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">
                  News Summary *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Concise overview of the simulated financial event..."
                  value={createForm.summary}
                  onChange={(e) => setCreateForm({ ...createForm, summary: e.target.value })}
                  className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-3 py-2 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">
                    Category
                  </label>
                  <select
                    value={createForm.category}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, category: e.target.value as NewsCategory })
                    }
                    className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">
                    Impact Direction
                  </label>
                  <select
                    value={createForm.impactDirection}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        impactDirection: e.target.value as NewsImpactDirection,
                      })
                    }
                    className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                  >
                    <option value="POSITIVE">Positive (Bullish Shock)</option>
                    <option value="NEGATIVE">Negative (Bearish Shock)</option>
                    <option value="NEUTRAL">Neutral</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">
                    Severity Level
                  </label>
                  <select
                    value={createForm.severity}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, severity: e.target.value as NewsSeverity })
                    }
                    className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                  >
                    <option value="LOW">LOW (0.25x Shock Weight)</option>
                    <option value="MEDIUM">MEDIUM (0.50x Shock Weight)</option>
                    <option value="HIGH">HIGH (0.75x Shock Weight)</option>
                    <option value="EXTREME">EXTREME (1.00x Shock Weight)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">
                    Target Scope
                  </label>
                  <select
                    value={createForm.targetScope}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, targetScope: e.target.value as NewsTargetScope })
                    }
                    className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                  >
                    <option value="INSTRUMENT">Single Instrument</option>
                    <option value="SECTOR">Sector Wide</option>
                    <option value="MARKET">Market Wide</option>
                  </select>
                </div>
              </div>

              {createForm.targetScope === 'INSTRUMENT' && (
                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">
                    Target Symbol
                  </label>
                  <select
                    value={createForm.targetSymbol || ''}
                    onChange={(e) => setCreateForm({ ...createForm, targetSymbol: e.target.value })}
                    className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                  >
                    {symbols.length > 0 ? (
                      symbols.map((sym) => (
                        <option key={sym} value={sym}>
                          {sym}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="RELIANCE">RELIANCE</option>
                        <option value="TCS">TCS</option>
                        <option value="INFY">INFY</option>
                        <option value="HDFCBANK">HDFCBANK</option>
                        <option value="TGRID">TGRID</option>
                      </>
                    )}
                  </select>
                </div>
              )}

              {createForm.targetScope === 'SECTOR' && (
                <div>
                  <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">
                    Target Sector
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Technology, Energy, Financial Services"
                    value={createForm.targetSector || ''}
                    onChange={(e) => setCreateForm({ ...createForm, targetSector: e.target.value })}
                    className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-3 py-2 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400"
                  />
                </div>
              )}

              {/* Catalyst Shock Parameters */}
              <div className="bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] p-3 rounded-lg space-y-3">
                <span className="text-[11px] font-semibold text-neutral-900 dark:text-white uppercase tracking-wider block">
                  Simulated Catalyst Parameters
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-500 text-[11px] font-mono mb-1">
                      Sentiment Score (-1.0 to +1.0)
                    </label>
                    <input
                      type="text"
                      value={createForm.catalyst?.sentimentScore || ''}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          catalyst: { ...createForm.catalyst, sentimentScore: e.target.value },
                        })
                      }
                      className="w-full bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-2.5 py-1.5 text-neutral-900 dark:text-white font-mono focus:outline-none focus:border-neutral-400"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-500 text-[11px] font-mono mb-1">
                      Volatility Multiplier (1.0 to 5.0)
                    </label>
                    <input
                      type="text"
                      value={createForm.catalyst?.volatilityFactor || ''}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          catalyst: { ...createForm.catalyst, volatilityFactor: e.target.value },
                        })
                      }
                      className="w-full bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-2.5 py-1.5 text-neutral-900 dark:text-white font-mono focus:outline-none focus:border-neutral-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-500 text-[11px] font-mono mb-1">
                      Duration (Seconds)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={86400}
                      value={createForm.catalyst?.durationSeconds || 300}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          catalyst: {
                            ...createForm.catalyst,
                            durationSeconds: parseInt(e.target.value, 10) || 300,
                          },
                        })
                      }
                      className="w-full bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-2.5 py-1.5 text-neutral-900 dark:text-white font-mono focus:outline-none focus:border-neutral-400"
                    />
                  </div>
                </div>
              </div>

              {/* Publication Strategy */}
              <div className="space-y-2 border-t border-neutral-200 dark:border-[#1F1F1F] pt-3">
                <label className="block text-neutral-700 dark:text-neutral-300 font-medium">
                  Publication Timing
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPublishMode('IMMEDIATE')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                      publishMode === 'IMMEDIATE'
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-black border-transparent'
                        : 'bg-neutral-50 dark:bg-[#141414] border-neutral-200 dark:border-[#1F1F1F] text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    Publish Immediately
                  </button>

                  <button
                    type="button"
                    onClick={() => setPublishMode('SCHEDULED')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                      publishMode === 'SCHEDULED'
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-black border-transparent'
                        : 'bg-neutral-50 dark:bg-[#141414] border-neutral-200 dark:border-[#1F1F1F] text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    Schedule for Later
                  </button>

                  <button
                    type="button"
                    onClick={() => setPublishMode('DRAFT')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                      publishMode === 'DRAFT'
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-black border-transparent'
                        : 'bg-neutral-50 dark:bg-[#141414] border-neutral-200 dark:border-[#1F1F1F] text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    Save as Draft
                  </button>
                </div>

                {publishMode === 'SCHEDULED' && (
                  <div className="pt-2">
                    <label className="block text-neutral-600 dark:text-neutral-400 mb-1 font-medium">
                      Select Publication Date & Time (Local / IST)
                    </label>
                    <input
                      type="datetime-local"
                      required={publishMode === 'SCHEDULED'}
                      value={scheduledDateTime}
                      onChange={(e) => setScheduledDateTime(e.target.value)}
                      className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg px-3 py-2 text-neutral-900 dark:text-white focus:outline-none focus:border-neutral-400"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200 dark:border-[#1F1F1F]">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                  className="border-neutral-200 dark:border-[#1F1F1F] text-neutral-600 dark:text-neutral-400"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-black dark:hover:bg-neutral-200 font-medium"
                >
                  {isSubmitting
                    ? 'Processing...'
                    : publishMode === 'IMMEDIATE'
                    ? 'Publish & Broadcast Catalyst'
                    : publishMode === 'SCHEDULED'
                    ? 'Schedule Article'
                    : 'Save Draft'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Audit Log Executions */}
      {showAuditModal && selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-[#1F1F1F] pb-3">
              <div>
                <h3 className="font-semibold text-neutral-900 dark:text-white text-sm">
                  Catalyst Audit History — News #{selectedArticle.id}
                </h3>
                <p className="text-xs text-neutral-500 truncate max-w-lg mt-0.5">
                  {selectedArticle.headline}
                </p>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingAudit ? (
              <div className="py-8 text-center text-neutral-500 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-neutral-600 dark:text-neutral-400" />
                Loading execution log...
              </div>
            ) : executions.length === 0 ? (
              <p className="py-6 text-center text-xs text-neutral-500">
                No execution audit entries recorded yet for this catalyst.
              </p>
            ) : (
              <div className="space-y-2">
                {executions.map((ex) => (
                  <div
                    key={ex.id}
                    className="p-3 bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#1F1F1F] rounded-lg text-xs space-y-1 font-mono"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-900 dark:text-white">{ex.action}</span>
                      <span className="text-[11px] text-neutral-500">
                        {formatISTDate(ex.createdAt)}
                      </span>
                    </div>
                    <div className="text-neutral-600 dark:text-neutral-400">
                      Effective Impact: <span className="text-neutral-900 dark:text-white font-bold">{ex.effectiveImpact}</span>
                    </div>
                    {ex.details && (
                      <div className="text-[11px] text-neutral-500 break-all">
                        Details: {typeof ex.details === 'string' ? ex.details : JSON.stringify(ex.details)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-neutral-200 dark:border-[#1F1F1F]">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAuditModal(false)}
                className="border-neutral-200 dark:border-[#1F1F1F] text-neutral-600 dark:text-neutral-400"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
