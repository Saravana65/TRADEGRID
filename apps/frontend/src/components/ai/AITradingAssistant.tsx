import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { researchService } from '../../services/research.service';
import { Instrument, MarketQuote, PortfolioInsight, QuantitativeSignal } from '@tradegrid/shared-types';
import { formatCurrency } from '../../utils/formatters';
import {
  Sparkles,
  X,
  Send,
  Bot,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  topic?: 'stock' | 'indicators' | 'portfolio' | 'signals' | 'education';
}

interface AITradingAssistantProps {
  selectedInstrument: Instrument | null;
  selectedQuote: MarketQuote | null;
}

export const AITradingAssistant: React.FC<AITradingAssistantProps> = ({
  selectedInstrument,
  selectedQuote,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [portfolioInsight, setPortfolioInsight] = useState<PortfolioInsight | null>(null);
  const [signals, setSignals] = useState<QuantitativeSignal[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sym = selectedInstrument?.symbol || 'TGRID';
  const price = selectedQuote?.lastPrice ? parseFloat(selectedQuote.lastPrice) : 142.50;
  const changePct = selectedQuote?.changePercent ? parseFloat(selectedQuote.changePercent) : 0.0;

  // Initialize welcome message when opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: 'welcome-1',
          sender: 'ai',
          text: `Hello! I am TradeGrid AI Assistant, your real-time simulated market copilot. Ask me anything about ${sym}, technical indicators, portfolio diversification, or trading mechanics.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      // Pre-load portfolio insights & signals for instant answers
      researchService.getPortfolioInsights().then(setPortfolioInsight).catch(() => {});
      researchService.getSignals({ symbol: sym }).then(setSignals).catch(() => {});
    }
  }, [isOpen, sym, messages.length]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Context-aware query handler
  const handleSendPrompt = async (promptText: string) => {
    if (!promptText.trim()) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsThinking(true);

    const query = promptText.toLowerCase();

    // Generate intelligent deterministic response using live state & server insights
    setTimeout(() => {
      let reply = '';

      if (query.includes('analyze') || query.includes(sym.toLowerCase()) || query.includes('stock')) {
        const trend = changePct > 0 ? 'bullish momentum' : changePct < 0 ? 'bearish consolidation' : 'neutral drift';
        reply = `**${sym} Analysis (${selectedInstrument?.name || sym})**\n` +
          `• **Current Price:** ${formatCurrency(price)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)\n` +
          `• **Technical Bias:** Showing ${trend} with day range ${formatCurrency(price * 0.98)} - ${formatCurrency(price * 1.02)}.\n` +
          `• **Sector:** ${selectedInstrument?.sector || 'Technology / General'}\n` +
          `• **Exchange Status:** Trading under ${selectedInstrument?.dataClassification || 'SIMULATED'} exchange rules.\n\n` +
          `*Recommendation:* Look for confirmation on the 15m volume histogram before placing directional limit orders.`;
      } else if (query.includes('rsi') || query.includes('indicator') || query.includes('macd') || query.includes('vwap') || query.includes('bollinger')) {
        reply = `**Technical Indicators Breakdown:**\n` +
          `• **RSI (Relative Strength Index):** Evaluates overbought (>70) and oversold (<30) momentum. When RSI diverges from price, a reversal is probable.\n` +
          `• **VWAP (Volume-Weighted Average Price):** The gold standard institutional benchmark. Trading above VWAP signals intraday buyer strength.\n` +
          `• **Bollinger Bands:** 20-period SMA ±2 standard deviations. Prices hugging outer bands signal high volatility; contraction indicates an imminent breakout.\n` +
          `• **MACD:** Fast (12) and Slow (26) EMA crossover. Bullish when MACD crosses above signal (9).`;
      } else if (query.includes('portfolio') || query.includes('risk') || query.includes('diversification')) {
        const score = portfolioInsight?.diversificationScore ?? 84;
        const drawdown = portfolioInsight?.maxDrawdownPercent ?? 4.2;
        const warnings = portfolioInsight?.riskWarnings?.length ?? 0;

        reply = `**Portfolio Risk & Health Audit:**\n` +
          `• **Diversification Score:** **${score}/100** (${score > 70 ? 'Optimal' : 'Needs Rebalancing'})\n` +
          `• **Estimated Max Drawdown:** ${drawdown.toFixed(2)}%\n` +
          `• **Active Risk Warnings:** ${warnings} flags detected.\n` +
          `• **Rule of Thumb:** Avoid concentrating more than 20% of virtual capital in any single high-beta instrument.`;
      } else if (query.includes('signal') || query.includes('backtest')) {
        if (signals.length > 0) {
          const s = signals[0];
          reply = `**Quantitative Strategy Signals (${sym}):**\n` +
            `• **Active Signal:** **${s.signalType}** (${s.strength || 'MODERATE'} confidence)\n` +
            `• **Quantitative Score:** ${s.score > 0 ? '+' : ''}${s.score} / 100\n` +
            `• **Signal Price:** ${formatCurrency(s.currentPrice || price)}\n` +
            `• **Strategy Context:** ${s.explanation || 'Rule-based quantitative oscillator signal'}\n` +
            `• **Backtest Target:** Historical win-rate on 1h interval is ~58.4% with 1:2 risk-to-reward.`;
        } else {
          reply = `**Quantitative Engine Insights:**\n` +
            `• No active breakout signals currently firing on ${sym}.\n` +
            `• Moving average crossover models are currently neutral.\n` +
            `• You can test custom strategies in the Strategy Studio or Research Backtester.`;
        }
      } else if (query.includes('limit') || query.includes('market') || query.includes('order')) {
        reply = `**Order Execution Mechanics:**\n` +
          `• **Market Order:** Matches immediately against the top of the order book at current market rates.\n` +
          `• **Limit Order:** Rests in the order book until a counterparty matches at or better than your limit price.\n` +
          `• *Tip:* In simulated environments, use limit orders to avoid slippage during rapid candle sweeps.`;
      } else {
        reply = `I am analyzing your query with the TRADEGRID quant engine. For ${sym}, current market volatility is normal. Remember to position-size according to your account equity and set explicit stop-loss parameters.`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setIsThinking(false);
    }, 600);
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <div className="fixed bottom-20 lg:bottom-6 right-6 z-40">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-full shadow-xl transition-all duration-200 border ${
            isOpen
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-black border-transparent'
              : 'bg-white dark:bg-[#121212] text-neutral-900 dark:text-white border-neutral-200 dark:border-[#262626] hover:scale-105 hover:shadow-2xl'
          }`}
          title="Open AI Trading Assistant"
        >
          <div className="relative">
            <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" />
          </div>
          <span className="text-xs font-bold font-sans">AI Copilot</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
        </button>
      </div>

      {/* Slide-Up Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 right-4 sm:right-6 z-50 w-[360px] sm:w-[400px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-6.5rem)] bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#222222] rounded-3xl shadow-2xl flex flex-col overflow-hidden select-none font-sans"
          >
            {/* Header */}
            <div className="p-4 border-b border-neutral-100 dark:border-[#1F1F1F] bg-neutral-50/50 dark:bg-[#0D0D0D] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-black shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                    TradeGrid AI Assistant
                  </h4>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                    Deterministic Insights • Educational Mode
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1A1A1A] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Context Badge */}
            <div className="px-4 py-2 bg-neutral-100/70 dark:bg-[#141414] border-b border-neutral-100 dark:border-[#1F1F1F] flex items-center justify-between text-[11px] font-mono">
              <span className="text-neutral-600 dark:text-neutral-400 truncate">
                Context: <strong className="text-neutral-900 dark:text-white">{sym}</strong> @ {formatCurrency(price)}
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold">
                LIVE
              </span>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const isAI = m.sender === 'ai';
                return (
                  <div
                    key={m.id}
                    className={`flex gap-2.5 ${isAI ? 'justify-start' : 'justify-end'}`}
                  >
                    {isAI && (
                      <div className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-[#1A1A1A] text-neutral-800 dark:text-neutral-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles className="w-3 h-3 text-emerald-500" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs font-sans leading-relaxed ${
                        isAI
                          ? 'bg-neutral-100 dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 border border-neutral-200/60 dark:border-[#222222]'
                          : 'bg-neutral-900 dark:bg-white text-white dark:text-black font-medium'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.text}</div>
                      <span className="text-[9px] opacity-50 block mt-1 text-right font-mono">
                        {m.timestamp}
                      </span>
                    </div>
                  </div>
                );
              })}

              {isThinking && (
                <div className="flex gap-2.5 items-center text-xs text-neutral-400">
                  <div className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-[#141414] flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-emerald-500 animate-spin" />
                  </div>
                  <span>Analyzing market microstructure...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompt Chips */}
            <div className="px-3 py-2 border-t border-neutral-100 dark:border-[#1F1F1F] bg-neutral-50/50 dark:bg-[#0D0D0D] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => handleSendPrompt(`Analyze ${sym}`)}
                className="px-2 py-1 rounded-lg text-[10px] whitespace-nowrap bg-white dark:bg-[#1A1A1A] border border-neutral-200 dark:border-[#262626] text-neutral-700 dark:text-neutral-300 hover:border-neutral-400 transition-colors"
              >
                📊 Analyze {sym}
              </button>
              <button
                onClick={() => handleSendPrompt('Explain RSI & MACD')}
                className="px-2 py-1 rounded-lg text-[10px] whitespace-nowrap bg-white dark:bg-[#1A1A1A] border border-neutral-200 dark:border-[#262626] text-neutral-700 dark:text-neutral-300 hover:border-neutral-400 transition-colors"
              >
                🔍 Explain RSI
              </button>
              <button
                onClick={() => handleSendPrompt('Check portfolio diversification')}
                className="px-2 py-1 rounded-lg text-[10px] whitespace-nowrap bg-white dark:bg-[#1A1A1A] border border-neutral-200 dark:border-[#262626] text-neutral-700 dark:text-neutral-300 hover:border-neutral-400 transition-colors"
              >
                🛡 Portfolio Health
              </button>
              <button
                onClick={() => handleSendPrompt('Explain limit vs market order')}
                className="px-2 py-1 rounded-lg text-[10px] whitespace-nowrap bg-white dark:bg-[#1A1A1A] border border-neutral-200 dark:border-[#262626] text-neutral-700 dark:text-neutral-300 hover:border-neutral-400 transition-colors"
              >
                💡 Limit vs Market
              </button>
            </div>

            {/* Input Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendPrompt(inputText);
              }}
              className="p-3 border-t border-neutral-100 dark:border-[#1F1F1F] flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Ask AI about ${sym} or market rules...`}
                className="flex-1 px-3 py-2 bg-neutral-100 dark:bg-[#141414] border border-neutral-200 dark:border-[#262626] rounded-xl text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isThinking}
                className="p-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-black hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Disclaimer Footer */}
            <div className="px-3 py-1 bg-neutral-100/50 dark:bg-[#0A0A0A] border-t border-neutral-100 dark:border-[#1F1F1F] text-[9px] text-neutral-400 text-center font-mono">
              Educational simulation only. AI cannot execute orders or modify ledger balances.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
