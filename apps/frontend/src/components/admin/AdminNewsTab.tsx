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
import { formatDate } from '../../utils/formatters';
import {
  Newspaper,
  Play,
  XCircle,
  RefreshCw,
  Plus,
  FileText,
  Activity,
  Zap,
  X,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  Radio,
  Search,
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
  const [createForm, setCreateForm] = useState<CreateNewsInput>({
    headline: '',
    summary: '',
    content: '',
    category: 'Product Launch',
    impactDirection: 'POSITIVE',
    severity: 'HIGH',
    targetScope: 'INSTRUMENT',
    targetSymbol: 'ALPHA',
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
          limit: 50,
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
        if (symList.length > 0 && !createForm.targetSymbol) {
          setCreateForm((prev) => ({ ...prev, targetSymbol: symList[0] }));
        }
      }
    } catch (err: any) {
      setActionError(`Failed to load news data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [categoryFilter, statusFilter, searchQuery, createForm.targetSymbol]);

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
      await newsApiService.createNews(createForm);
      setShowCreateModal(false);
      setActionNotice(`Simulated news article "${createForm.headline}" created successfully.`);
      fetchNewsAndMetrics();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
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
        return <Badge variant="gain">ACTIVE</Badge>;
      case 'SCHEDULED':
        return <Badge variant="cyan">SCHEDULED</Badge>;
      case 'DRAFT':
        return <Badge variant="neutral">DRAFT</Badge>;
      case 'EXPIRED':
        return <Badge variant="loss">EXPIRED</Badge>;
      case 'CANCELLED':
        return <Badge variant="amber">CANCELLED</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const renderImpactBadge = (direction: NewsImpactDirection, score?: string) => {
    const isBullish = direction === 'POSITIVE';
    const isBearish = direction === 'NEGATIVE';

    if (isBullish) {
      return (
        <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-xs font-semibold bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
          <TrendingUp className="w-3 h-3" />
          +{score || '0.00'}
        </span>
      );
    }
    if (isBearish) {
      return (
        <span className="inline-flex items-center gap-1 text-rose-400 font-mono text-xs font-semibold bg-rose-950/40 border border-rose-800/40 px-2 py-0.5 rounded">
          <TrendingDown className="w-3 h-3" />
          {score || '-0.00'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-xs font-semibold bg-slate-800/40 border border-slate-700/40 px-2 py-0.5 rounded">
        {score || '0.00'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Mandatory Simulated News Disclaimer Banner */}
      <div className="bg-purple-950/40 border border-purple-800/50 p-4 rounded-xl flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-purple-300">
              SIMULATED NEWS ENGINE — NOT REAL FINANCIAL NEWS
            </span>
            <Badge variant="simulated">100% SYNTHETIC</Badge>
          </div>
          <p className="text-xs text-purple-200/80 leading-relaxed">
            All news stories, sector catalysts, and price shock variables are generated strictly for simulated virtual trading. The news engine skews simulated market maker bot quotes and order flow without fabricating trades or directly altering ledger balances.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {actionNotice && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-lg text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="hover:text-emerald-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-lg text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="hover:text-rose-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/60 border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Total Stories</p>
              <p className="text-2xl font-bold font-mono text-white mt-1">
                {metrics?.totalArticles ?? articles.length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-cyan-950/50 border border-cyan-800/40 flex items-center justify-center">
              <Newspaper className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Active Catalysts</p>
              <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                {metrics?.activeCatalysts ?? articles.filter((a) => a.status === 'ACTIVE').length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-950/50 border border-emerald-800/40 flex items-center justify-center">
              <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Scheduled Articles</p>
              <p className="text-2xl font-bold font-mono text-purple-400 mt-1">
                {metrics?.scheduledArticles ?? articles.filter((a) => a.status === 'SCHEDULED').length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-purple-950/50 border border-purple-800/40 flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-400" />
            </div>
          </div>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Expired Catalysts</p>
              <p className="text-2xl font-bold font-mono text-slate-400 mt-1">
                {metrics?.expiredArticles ?? articles.filter((a) => a.status === 'EXPIRED').length}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-slate-800/50 border border-slate-700/40 flex items-center justify-center">
              <Zap className="w-5 h-5 text-slate-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Controls & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search news headline..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
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
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
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
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Publish Simulated News
          </Button>
        </div>
      </div>

      {/* News Articles Grid / List */}
      <div className="space-y-3">
        {articles.length === 0 ? (
          <Card className="text-center py-12 text-slate-400 bg-slate-900/40 border-slate-800">
            <Newspaper className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="text-sm">No simulated news articles found matching the current filters.</p>
            <p className="text-xs text-slate-500 mt-1">
              Click &quot;Publish Simulated News&quot; above to create a catalyst event.
            </p>
          </Card>
        ) : (
          articles.map((item) => (
            <Card
              key={item.id}
              className={`bg-slate-900/60 border ${
                item.status === 'ACTIVE'
                  ? 'border-emerald-800/40 ring-1 ring-emerald-500/10'
                  : 'border-slate-800'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {renderStatusBadge(item.status)}
                    <Badge variant="simulated">SIMULATED</Badge>
                    <span className="font-semibold text-slate-300 bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                      {item.category}
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      Scope: <strong className="text-white font-mono">{item.targetScope}</strong>
                      {item.targetSymbol && (
                        <> ({item.targetSymbol})</>
                      )}
                      {item.targetSector && (
                        <> ({item.targetSector})</>
                      )}
                    </span>
                    {item.catalyst && (
                      <div className="flex items-center gap-2 ml-auto">
                        {renderImpactBadge(item.impactDirection, item.catalyst.sentimentScore)}
                        <span className="text-[11px] font-mono text-purple-300 bg-purple-950/40 border border-purple-800/40 px-2 py-0.5 rounded">
                          Vol: {item.catalyst.volatilityFactor}x
                        </span>
                      </div>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold text-white leading-snug">
                    {item.headline}
                  </h3>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {item.summary}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-1">
                    {item.publishedAt && (
                      <span>Published: {formatDate(item.publishedAt)}</span>
                    )}
                    {item.scheduledAt && item.status === 'SCHEDULED' && (
                      <span className="text-purple-400 font-mono">
                        Scheduled for: {formatDate(item.scheduledAt)}
                      </span>
                    )}
                    {item.expiresAt && item.status === 'ACTIVE' && (
                      <span className="text-emerald-400 font-mono">
                        Expires: {formatDate(item.expiresAt)}
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
                      className="border-rose-800 text-rose-400 hover:bg-rose-950/40 text-xs h-7 px-2.5"
                    >
                      <XCircle className="w-3 h-3 mr-1" />
                      Cancel
                    </Button>
                  )}

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenAudit(item)}
                    className="border-slate-800 text-slate-400 hover:bg-slate-800 text-xs h-7 px-2.5"
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

      {/* Modal: Publish Simulated News */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-white text-sm">Publish Simulated News Catalyst</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNews} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">News Headline *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ALPHA Corp Signs Major AI Cloud Partnership"
                  value={createForm.headline}
                  onChange={(e) => setCreateForm({ ...createForm, headline: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">News Summary *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Concise overview of the simulated financial event..."
                  value={createForm.summary}
                  onChange={(e) => setCreateForm({ ...createForm, summary: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Category</label>
                  <select
                    value={createForm.category}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, category: e.target.value as NewsCategory })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Impact Direction</label>
                  <select
                    value={createForm.impactDirection}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        impactDirection: e.target.value as NewsImpactDirection,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="POSITIVE">Positive (Bullish Shock)</option>
                    <option value="NEGATIVE">Negative (Bearish Shock)</option>
                    <option value="NEUTRAL">Neutral</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Severity Level</label>
                  <select
                    value={createForm.severity}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, severity: e.target.value as NewsSeverity })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="LOW">LOW (0.25x Shock Weight)</option>
                    <option value="MEDIUM">MEDIUM (0.50x Shock Weight)</option>
                    <option value="HIGH">HIGH (0.75x Shock Weight)</option>
                    <option value="EXTREME">EXTREME (1.00x Shock Weight)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Target Scope</label>
                  <select
                    value={createForm.targetScope}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, targetScope: e.target.value as NewsTargetScope })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="INSTRUMENT">Single Instrument</option>
                    <option value="SECTOR">Sector Wide</option>
                    <option value="MARKET">Market Wide</option>
                  </select>
                </div>
              </div>

              {createForm.targetScope === 'INSTRUMENT' && (
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Target Symbol</label>
                  <select
                    value={createForm.targetSymbol || ''}
                    onChange={(e) => setCreateForm({ ...createForm, targetSymbol: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  >
                    {symbols.map((sym) => (
                      <option key={sym} value={sym}>
                        {sym}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {createForm.targetScope === 'SECTOR' && (
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Target Sector</label>
                  <input
                    type="text"
                    placeholder="e.g. Technology, Energy, Healthcare"
                    value={createForm.targetSector || ''}
                    onChange={(e) => setCreateForm({ ...createForm, targetSector: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              {/* Catalyst Shock Parameters */}
              <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg space-y-3">
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                  Simulated Catalyst Parameters
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-mono text-[11px]">
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
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-mono text-[11px]">
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
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-mono text-[11px]">
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
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="publishImmediately"
                      checked={createForm.publishImmediately}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, publishImmediately: e.target.checked })
                      }
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <label htmlFor="publishImmediately" className="text-slate-300 font-medium">
                      Publish Immediately
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                  className="border-slate-800 text-slate-400"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white"
                >
                  {isSubmitting ? 'Publishing...' : 'Create & Broadcast'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Audit Log Executions */}
      {showAuditModal && selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-semibold text-white text-sm">
                  Catalyst Audit History — News #{selectedArticle.id}
                </h3>
                <p className="text-xs text-slate-400 truncate max-w-lg mt-0.5">
                  {selectedArticle.headline}
                </p>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingAudit ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-500" />
                Loading execution log...
              </div>
            ) : executions.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                No execution audit entries recorded yet for this catalyst.
              </p>
            ) : (
              <div className="space-y-2">
                {executions.map((ex) => (
                  <div
                    key={ex.id}
                    className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs space-y-1 font-mono"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-cyan-400">{ex.action}</span>
                      <span className="text-[11px] text-slate-500">
                        {formatDate(ex.createdAt)}
                      </span>
                    </div>
                    <div className="text-slate-400">
                      Effective Impact: <span className="text-white">{ex.effectiveImpact}</span>
                    </div>
                    {ex.details && (
                      <div className="text-[11px] text-slate-500 break-all">
                        Details: {typeof ex.details === 'string' ? ex.details : JSON.stringify(ex.details)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAuditModal(false)}
                className="border-slate-800 text-slate-400"
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
