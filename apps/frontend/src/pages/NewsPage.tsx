import React from 'react';
import { NewsItem } from '@tradegrid/shared-types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { formatDate } from '../utils/formatters';
import { Newspaper, AlertTriangle, Clock, Zap } from 'lucide-react';

const simulatedNewsFeed: NewsItem[] = [
  {
    id: 'news-101',
    title: 'Nexus Quantum achieves commercial validation for next-gen synthetic processors',
    summary:
      'In a simulated shareholder announcement, Nexus Quantum confirmed initial delivery of its 2nm equivalent architecture, projecting synthetic quarterly earnings uplift.',
    source: 'TRADEGRID Simulation Wire',
    publishedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    isSimulated: true,
    impactScore: 0.85,
    affectedSymbols: ['NEXUS', 'CYBER'],
  },
  {
    id: 'news-102',
    title: 'TradeGrid Technologies expands virtual matching infrastructure to sub-millisecond nodes',
    summary:
      'Engineers have completed the modular monolith refactoring, preparing the virtual matching engine to process 5,000 synthetic order operations per second.',
    source: 'TRADEGRID Internal Systems',
    publishedAt: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
    isSimulated: true,
    impactScore: 0.65,
    affectedSymbols: ['TGRID'],
  },
  {
    id: 'news-103',
    title: 'Clean Energy sector affected by simulated supply chain inventory corrections',
    summary:
      'Solaris Energy reported transient shipping delays in synthetic raw mineral delivery, causing moderate intra-day volatility across alternative power listings.',
    source: 'TRADEGRID Simulation Wire',
    publishedAt: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
    isSimulated: true,
    impactScore: -0.45,
    affectedSymbols: ['SOLARIS'],
  },
  {
    id: 'news-104',
    title: 'BioGen Therapeutics advances Phase 3 simulated trials for cardiovascular therapy',
    summary:
      'Clinical trial simulation bots produced favorable primary endpoint markers, driving speculative simulated volume.',
    source: 'TRADEGRID Simulation Wire',
    publishedAt: new Date(Date.now() - 220 * 60 * 1000).toISOString(),
    isSimulated: true,
    impactScore: 0.72,
    affectedSymbols: ['BIOGEN'],
  },
];

export const NewsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Prominent Disclaimer Banner */}
      <div className="bg-purple-950/40 border border-purple-800/40 p-4 rounded-xl flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-purple-300">
              MANDATORY EDUCATIONAL DISCLAIMER
            </span>
            <Badge variant="simulated">SIMULATED CONTENT ONLY</Badge>
          </div>
          <p className="text-xs text-purple-200/80 leading-relaxed">
            All news stories, headlines, company figures, and catalyst events published on this wire are <strong>100% synthetic and computer-generated</strong> for market simulation exercises. They do not describe or represent any real-world companies or events.
          </p>
        </div>
      </div>

      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-cyan-400" />
          Simulated Market News & Catalyst Feed
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Real-time news headlines that drive trader sentiment, automated trading bots, and simulated price momentum.
        </p>
      </div>

      {/* News Stream */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {simulatedNewsFeed.map((item) => {
          const isBullish = (item.impactScore || 0) > 0;
          return (
            <Card
              key={item.id}
              className="hover:border-slate-700 transition-all duration-200"
            >
              <div className="space-y-3">
                {/* Meta header */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="simulated">SIMULATED</Badge>
                    <span className="text-[11px] text-slate-400">{item.source}</span>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                    <Clock className="w-3 h-3" /> {formatDate(item.publishedAt)}
                  </span>
                </div>

                {/* Headline */}
                <h3 className="text-sm font-semibold text-slate-100 hover:text-cyan-300 cursor-pointer transition-colors leading-snug">
                  {item.title}
                </h3>

                {/* Summary */}
                <p className="text-xs text-slate-400 leading-relaxed">{item.summary}</p>

                {/* Impact Tags and Affected Equities */}
                <div className="pt-2 border-t border-card-border/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Affected:</span>
                    {item.affectedSymbols?.map((sym) => (
                      <span
                        key={sym}
                        className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-[10px] font-semibold border border-slate-700"
                      >
                        ${sym}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 text-[11px] font-mono">
                    <Zap className={`w-3 h-3 ${isBullish ? 'text-emerald-400' : 'text-rose-400'}`} />
                    <span className={isBullish ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                      Impact: {isBullish ? '+' : ''}
                      {((item.impactScore || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Architecture Rationale */}
      <Card title="How Simulated Catalysts Work (Phase 2 Roadmap)">
        <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
          <p>
            In Phase 2, the <strong>Market Event Engine</strong> will allow administrators to inject market shocks (such as interest rate hikes, sudden earnings beats, or supply disruptions).
          </p>
          <p>
            When an event is injected, it applies a decay curve to the stock's fair-value path in the <strong>Market Simulation Engine</strong> and instructs automated panic-selling or momentum bots to react, generating realistic price volatility on the order book.
          </p>
        </div>
      </Card>
    </div>
  );
};
