"use client";

import { useState } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { useTheme } from "next-themes";
import {
  ChevronDown,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  PlusCircle,
  BarChart2,
  FileSpreadsheet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface StockItem {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  classification: "REAL" | "SIMULATED";
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  sparkline: number[];
  volatility: "low" | "mid" | "high";
  status: "bullish" | "bearish" | "neutral" | "volatile" | "catalyst";
  lastAction: string;
}

interface StocksTableProps {
  title?: string;
  stocks?: StockItem[];
  onStockAction?: (symbol: string, action: string) => void;
  className?: string;
}

export const defaultStocks: StockItem[] = [
  {
    id: "1",
    symbol: "RELIANCE",
    name: "Reliance Industries Ltd",
    exchange: "NSE",
    sector: "Energy",
    classification: "REAL",
    price: 3002.68,
    change: 38.10,
    changePercent: 1.28,
    volume: 8450120,
    sparkline: [2960, 2968, 2975, 2970, 2985, 2990, 2988, 3000, 3005, 3002.68],
    volatility: "mid",
    status: "bullish",
    lastAction: "15:29:50 IST"
  },
  {
    id: "2",
    symbol: "TCS",
    name: "Tata Consultancy Services",
    exchange: "NSE",
    sector: "Technology",
    classification: "REAL",
    price: 3879.10,
    change: 28.45,
    changePercent: 0.74,
    volume: 3210450,
    sparkline: [3840, 3848, 3855, 3850, 3862, 3870, 3865, 3875, 3882, 3879.10],
    volatility: "low",
    status: "bullish",
    lastAction: "15:29:45 IST"
  },
  {
    id: "3",
    symbol: "INFY",
    name: "Infosys Limited",
    exchange: "NSE",
    sector: "Technology",
    classification: "REAL",
    price: 1469.21,
    change: -2.10,
    changePercent: -0.14,
    volume: 6710200,
    sparkline: [1475, 1478, 1474, 1470, 1472, 1468, 1465, 1469, 1466, 1469.21],
    volatility: "low",
    status: "neutral",
    lastAction: "15:29:40 IST"
  },
  {
    id: "4",
    symbol: "HDFCBANK",
    name: "HDFC Bank Limited",
    exchange: "NSE",
    sector: "Banking",
    classification: "REAL",
    price: 1621.79,
    change: 4.05,
    changePercent: 0.25,
    volume: 12450000,
    sparkline: [1615, 1618, 1616, 1620, 1622, 1619, 1624, 1621, 1625, 1621.79],
    volatility: "low",
    status: "bullish",
    lastAction: "15:29:55 IST"
  },
  {
    id: "5",
    symbol: "ICICIBANK",
    name: "ICICI Bank Limited",
    exchange: "NSE",
    sector: "Banking",
    classification: "REAL",
    price: 1084.61,
    change: -8.85,
    changePercent: -0.81,
    volume: 9120400,
    sparkline: [1095, 1093, 1090, 1088, 1091, 1087, 1085, 1083, 1082, 1084.61],
    volatility: "mid",
    status: "bearish",
    lastAction: "15:29:30 IST"
  },
  {
    id: "6",
    symbol: "TGRID",
    name: "TradeGrid Technologies Corp",
    exchange: "TRADEGRID",
    sector: "FinTech",
    classification: "SIMULATED",
    price: 145.12,
    change: -6.90,
    changePercent: -4.54,
    volume: 2540000,
    sparkline: [154, 153, 151, 150, 148, 147, 146, 144, 145, 145.12],
    volatility: "high",
    status: "volatile",
    lastAction: "15:29:58 IST"
  },
  {
    id: "7",
    symbol: "NEXUS",
    name: "Nexus Quantum Systems",
    exchange: "TRADEGRID",
    sector: "Semiconductors",
    classification: "SIMULATED",
    price: 309.14,
    change: -1.01,
    changePercent: -0.33,
    volume: 1845000,
    sparkline: [312, 311, 310, 313, 311, 310, 308, 309, 310, 309.14],
    volatility: "mid",
    status: "neutral",
    lastAction: "15:29:20 IST"
  },
  {
    id: "8",
    symbol: "CYBER",
    name: "CyberShield Defense Labs",
    exchange: "TRADEGRID",
    sector: "Cybersecurity",
    classification: "SIMULATED",
    price: 173.53,
    change: -0.16,
    changePercent: -0.09,
    volume: 1420100,
    sparkline: [175, 174, 174.5, 173.8, 174.2, 173.9, 173.2, 173.6, 173.4, 173.53],
    volatility: "low",
    status: "neutral",
    lastAction: "15:29:15 IST"
  },
  {
    id: "9",
    symbol: "SOLARIS",
    name: "Solaris Clean Energy",
    exchange: "TRADEGRID",
    sector: "Clean Energy",
    classification: "SIMULATED",
    price: 89.89,
    change: 0.31,
    changePercent: 0.35,
    volume: 980200,
    sparkline: [88.5, 88.8, 89.0, 89.2, 89.1, 89.4, 89.6, 89.7, 89.8, 89.89],
    volatility: "mid",
    status: "bullish",
    lastAction: "15:29:10 IST"
  }
];

export function StocksDataTable({
  title = "Live Market Stock Updates",
  stocks: initialStocks = defaultStocks,
  onStockAction,
  className = ""
}: StocksTableProps = {}) {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<StockItem[]>(initialStocks);
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const [sortField, setSortField] = useState<"symbol" | "price" | "change" | "volume">("volume");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const handleStockSelection = (stockId: string, selected: boolean) => {
    const newSelected = new Set(selectedStocks);
    if (selected) {
      newSelected.add(stockId);
    } else {
      newSelected.delete(stockId);
    }
    setSelectedStocks(newSelected);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedStocks(new Set(stocks.map(s => s.id)));
    } else {
      setSelectedStocks(new Set());
    }
  };

  const isSelected = (stockId: string) => selectedStocks.has(stockId);
  const isAllSelected = selectedStocks.size === stocks.length && stocks.length > 0;
  const isIndeterminate = selectedStocks.size > 0 && selectedStocks.size < stocks.length;

  const handleStockAction = (symbol: string, action: string) => {
    if (onStockAction) {
      onStockAction(symbol, action);
    } else {
      if (action === "trade") {
        navigate(`/trade?symbol=${symbol}`);
      } else if (action === "chart") {
        navigate(`/charting?symbol=${symbol}`);
      }
    }
  };

  const handleSort = (field: "symbol" | "price" | "change" | "volume") => {
    const newOrder = sortField === field && sortOrder === "asc" ? "desc" : "asc";
    setSortField(field);
    setSortOrder(newOrder);

    const sorted = [...stocks].sort((a, b) => {
      let valA: any = a[field];
      let valB: any = b[field];
      if (typeof valA === "string") {
        return newOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      return newOrder === "asc" ? valA - valB : valB - valA;
    });

    setStocks(sorted);
  };

  const formatVolume = (vol: number) => {
    if (vol >= 10000000) return `${(vol / 10000000).toFixed(2)} Cr`;
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
    return vol.toLocaleString();
  };

  const formatPrice = (p: number, exchange: string) => {
    const symbol = exchange === "NSE" || exchange === "BSE" ? "₹" : "$";
    return `${symbol}${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusPill = (status: StockItem["status"]) => {
    const config = {
      bullish: {
        bg: "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800/30",
        label: "BULLISH"
      },
      bearish: {
        bg: "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-800/30",
        label: "BEARISH"
      },
      neutral: {
        bg: "bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-900/40 dark:text-neutral-400 dark:border-neutral-800",
        label: "NEUTRAL"
      },
      volatile: {
        bg: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800/30",
        label: "VOLATILE"
      },
      catalyst: {
        bg: "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-800/30",
        label: "CATALYST"
      }
    }[status];

    return (
      <div className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border tracking-wider ${config.bg}`}>
        {config.label}
      </div>
    );
  };

  const renderSparkline = (data: number[]) => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const isUpTrend = data[data.length - 1] >= data[0];

    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * 64;
      const y = 20 - ((val - min) / range) * 16;
      return `${x},${y}`;
    }).join(" ");

    const strokeColor = isUpTrend
      ? (isDark ? "#22c55e" : "#16a34a")
      : (isDark ? "#f87171" : "#dc2626");

    return (
      <div className="w-16 h-6 flex items-center">
        <svg width="64" height="22" viewBox="0 0 64 22" className="overflow-visible">
          <polyline
            points={points}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={64}
            cy={20 - ((data[data.length - 1] - min) / range) * 16}
            r="2.5"
            fill={strokeColor}
          />
        </svg>
      </div>
    );
  };

  const getVolatilityIcon = (vol: StockItem["volatility"]) => {
    const bars = vol === "low" ? 1 : vol === "mid" ? 2 : 3;
    const colors = {
      low: "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800/30",
      mid: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800/30",
      high: "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-800/30"
    };

    return (
      <div className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border flex items-center gap-1.5 ${colors[vol]}`}>
        <div className="flex items-end gap-0.5">
          {[1, 2, 3].map((b) => (
            <div
              key={b}
              className={`w-1 rounded-full ${b <= bars ? "bg-current" : "bg-current/30"}`}
              style={{ height: b === 1 ? "4px" : b === 2 ? "8px" : "12px" }}
            />
          ))}
        </div>
        <span className="uppercase text-[10px] tracking-wide">{vol}</span>
      </div>
    );
  };

  const containerVariants: Variants = {
    visible: {
      transition: {
        staggerChildren: 0.04,
        delayChildren: 0.1,
      }
    }
  };

  const rowVariants: Variants = {
    hidden: {
      opacity: 0,
      y: 16,
      scale: 0.99,
      filter: "blur(4px)"
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        type: "spring" as const,
        stiffness: 400,
        damping: 25,
        mass: 0.7,
      },
    },
  };

  return (
    <div className={`w-full max-w-7xl mx-auto ${className}`}>
      {/* Table Container */}
      <div className="bg-background border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        {/* Table Header Bar */}
        {title && (
          <div className="px-6 py-4 border-b border-border/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-muted/5">
            <div>
              <h2 className="text-base font-bold text-foreground/90 tracking-tight">{title}</h2>
              <p className="text-xs text-muted-foreground/70">
                Streaming prices, sparkline momentum, and algorithmic volatility metrics.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground/80">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>LIVE FEED ({stocks.length} STOCKS)</span>
            </div>
          </div>
        )}

        {/* Table Column Titles */}
        <div className="grid grid-cols-7 gap-4 px-6 py-3 text-xs font-medium text-muted-foreground/70 uppercase tracking-wide bg-muted/15 border-b border-border/20 select-none">
          {/* Symbol / Stock */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleSort("symbol")}>
            <div className="relative">
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={(el) => {
                  if (el) el.indeterminate = isIndeterminate;
                }}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="w-4 h-4 rounded border-muted-foreground/40 text-muted-foreground focus:ring-muted-foreground/20 focus:ring-2 accent-muted-foreground bg-background"
              />
            </div>
            <span>Asset / Symbol</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortField === "symbol" && sortOrder === "asc" ? "rotate-180" : ""}`} />
          </div>

          <div>Sector</div>
          <div>Sentiment</div>

          {/* Price */}
          <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort("price")}>
            <span>Price & Change</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortField === "price" && sortOrder === "asc" ? "rotate-180" : ""}`} />
          </div>

          <div>10T Trend</div>
          <div>Volatility</div>

          {/* Volume / Action */}
          <div className="flex items-center gap-1 cursor-pointer" onClick={() => handleSort("volume")}>
            <span>Volume / Trade</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortField === "volume" && sortOrder === "asc" ? "rotate-180" : ""}`} />
          </div>
        </div>

        {/* Table Rows */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {stocks.map((stock, index) => {
            const isUp = stock.change >= 0;
            return (
              <motion.div key={stock.id} variants={rowVariants}>
                <div
                  className={`grid grid-cols-7 gap-4 px-6 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer group relative items-center ${
                    isSelected(stock.id) ? "bg-primary/5 dark:bg-primary/10" : ""
                  } ${index < stocks.length - 1 ? "border-b border-border/20" : ""}`}
                  onMouseEnter={() => setHoveredAction(stock.id)}
                  onMouseLeave={() => setHoveredAction(null)}
                >
                  {/* Stock Symbol & Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected(stock.id)}
                      onChange={(e) => handleStockSelection(stock.id, e.target.checked)}
                      className="w-4 h-4 rounded border-muted-foreground/40 text-muted-foreground focus:ring-muted-foreground/20 focus:ring-2 accent-muted-foreground bg-background shrink-0"
                    />
                    <div className="w-8 h-8 rounded-xl bg-muted/40 border border-border/20 flex items-center justify-center font-bold font-mono text-xs text-foreground/90 shrink-0">
                      {stock.symbol.slice(0, 2)}
                    </div>
                    <div className="min-w-0 truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-foreground/90 font-mono text-sm tracking-tight">
                          {stock.symbol}
                        </span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-muted/50 border border-border/30 text-muted-foreground/80 font-mono">
                          {stock.exchange}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground/70 truncate">{stock.name}</div>
                    </div>
                  </div>

                  {/* Sector */}
                  <div className="flex items-center">
                    <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-muted/30 border border-border/20 text-foreground/80 truncate">
                      {stock.sector}
                    </span>
                  </div>

                  {/* Sentiment Status */}
                  <div className="flex items-center">
                    {getStatusPill(stock.status)}
                  </div>

                  {/* Price & Change */}
                  <div className="flex flex-col justify-center min-w-0">
                    <span className="font-mono font-bold text-foreground/90 text-sm tabular-nums">
                      {formatPrice(stock.price, stock.exchange)}
                    </span>
                    <div className={`flex items-center gap-0.5 text-xs font-mono font-semibold tabular-nums ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      <span>{isUp ? "+" : ""}{stock.changePercent.toFixed(2)}%</span>
                    </div>
                  </div>

                  {/* Trend Sparkline */}
                  <div className="flex items-center">
                    {renderSparkline(stock.sparkline)}
                  </div>

                  {/* Volatility Indicator */}
                  <div className="flex items-center">
                    {getVolatilityIcon(stock.volatility)}
                  </div>

                  {/* Last Action / Quick Trade Slide-in */}
                  <div className="flex items-center justify-between">
                    <AnimatePresence mode="wait">
                      {hoveredAction === stock.id ? (
                        <motion.div
                          initial={{ opacity: 0, x: -8, filter: "blur(4px)" }}
                          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                          exit={{ opacity: 0, x: -8, filter: "blur(4px)" }}
                          transition={{ type: "spring", stiffness: 500, damping: 25 }}
                          className="flex items-center gap-1.5"
                        >
                          <button
                            onClick={() => handleStockAction(stock.symbol, "trade")}
                            className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
                          >
                            Trade
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleStockAction(stock.symbol, "chart")}
                            className="p-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground/80 transition-colors"
                            title="Open Technical Chart"
                          >
                            <BarChart2 className="w-3.5 h-3.5" />
                          </button>
                        </motion.div>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          transition={{ duration: 0.05 }}
                          className="flex flex-col text-xs font-mono text-muted-foreground/70"
                        >
                          <span>Vol: {formatVolume(stock.volume)}</span>
                          <span className="text-[10px] text-muted-foreground/50">{stock.lastAction}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Floating Batch Action Dock for Selected Stocks */}
      <AnimatePresence>
        {selectedStocks.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0, filter: "blur(8px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: 80, opacity: 0, filter: "blur(8px)" }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
              mass: 0.8,
            }}
            className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50"
          >
            <div className="bg-background/95 backdrop-blur-lg border border-border/50 rounded-2xl px-5 py-2.5 shadow-2xl flex items-center gap-4">
              <span className="text-xs font-bold font-mono text-foreground/90 whitespace-nowrap">
                {selectedStocks.size} assets selected
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const firstSelected = stocks.find(s => selectedStocks.has(s.id));
                    if (firstSelected) navigate(`/trade?symbol=${firstSelected.symbol}`);
                  }}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Terminal Trade
                </button>

                <button
                  onClick={() => {
                    const firstSelected = stocks.find(s => selectedStocks.has(s.id));
                    if (firstSelected) navigate(`/charting?symbol=${firstSelected.symbol}`);
                  }}
                  className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground/80 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  Chart Studio
                </button>

                <button
                  onClick={() => console.log("Added to watchlist:", Array.from(selectedStocks))}
                  className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground/80 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Add to Watchlist
                </button>

                <button
                  onClick={() => {
                    const selectedData = stocks.filter(s => selectedStocks.has(s.id));
                    const csv = "Symbol,Name,Price,ChangePct,Volume\n" + selectedData.map(s => `${s.symbol},"${s.name}",${s.price},${s.changePercent},${s.volume}`).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "tradegrid-stocks.csv";
                    a.click();
                  }}
                  className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground/80 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export .CSV
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
