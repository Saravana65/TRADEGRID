import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  HistogramData,
  ColorType,
  CrosshairMode,
  UTCTimestamp,
} from 'lightweight-charts';
import {
  ChartType,
  CandleInterval,
  IndicatorConfig,
} from '@tradegrid/shared-types';
import { chartingApiService } from '../../services/charting.service';
import { marketApiService } from '../../services/market.service';
import { socketService } from '../../services/socket.service';
import { formatCurrency } from '../../utils/formatters';
import { useUIStore } from '../../store/uiStore';
import {
  RotateCcw,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
} from 'lucide-react';

interface AdvancedTradingChartProps {
  symbol: string;
  height?: number;
  showToolbar?: boolean;
  onSymbolChange?: (symbol: string) => void;
  compact?: boolean;
  dataClassification?: 'SIMULATED' | 'REAL' | 'DELAYED';
}

interface ActiveBarState {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CrosshairData {
  timeStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
}

const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '1d': 86400,
};

export const AdvancedTradingChart: React.FC<AdvancedTradingChartProps> = ({
  symbol,
  height = 520,
  showToolbar = true,
  dataClassification = 'SIMULATED',
}) => {
  const { effectiveTheme } = useUIStore();
  const isDark = effectiveTheme === 'dark';

  // Container refs
  const containerWrapperRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);

  // Chart & Series instances
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlaySeriesMapRef = useRef<Map<string, ISeriesApi<any>>>(new Map());

  // Active bar tracking for realtime streaming merging
  const activeBarRef = useRef<ActiveBarState | null>(null);

  // State
  const [interval, setIntervalState] = useState<CandleInterval>('1m');
  const [chartType, setChartType] = useState<ChartType>('CANDLESTICK');
  const [candles, setCandles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastTickPrice, setLastTickPrice] = useState<number | null>(null);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const [lastTickTime, setLastTickTime] = useState<Date | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);

  // Active Crosshair HUD Data
  const [crosshairInfo, setCrosshairInfo] = useState<CrosshairData | null>(null);

  // Active Indicator Toggles
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([
    {
      id: 'sma-20',
      type: 'SMA',
      panel: 'OVERLAY',
      enabled: false,
      params: { period: 20 },
      style: { color: '#3B82F6', lineWidth: 2 },
    },
    {
      id: 'ema-50',
      type: 'EMA',
      panel: 'OVERLAY',
      enabled: false,
      params: { period: 50 },
      style: { color: '#F59E0B', lineWidth: 2 },
    },
    {
      id: 'bb-20',
      type: 'BOLLINGER_BANDS',
      panel: 'OVERLAY',
      enabled: false,
      params: { period: 20, multiplier: 2 },
      style: { color: '#8B5CF6', lineWidth: 1, secondaryColor: '#6366F1' },
    },
    {
      id: 'vwap-session',
      type: 'VWAP',
      panel: 'OVERLAY',
      enabled: false,
      params: {},
      style: { color: '#10B981', lineWidth: 2 },
    },
    {
      id: 'rsi-14',
      type: 'RSI',
      panel: 'SEPARATE',
      enabled: false,
      params: { period: 14 },
      style: { color: '#EC4899', lineWidth: 2 },
    },
  ]);

  const isRsiEnabled = useMemo(
    () => indicators.some((i) => i.id === 'rsi-14' && i.enabled),
    [indicators]
  );

  // Load User Preferences from server
  useEffect(() => {
    let isMounted = true;
    async function loadPreferences() {
      try {
        const pref = await chartingApiService.getPreferences(symbol);
        if (isMounted && pref) {
          if (pref.interval) setIntervalState(pref.interval as CandleInterval);
          if (pref.chartType) setChartType(pref.chartType);
        }
      } catch {
        // Fallback to default
      }
    }
    loadPreferences();
    return () => {
      isMounted = false;
    };
  }, [symbol]);

  // Fetch Historical Candles
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    async function loadCandles() {
      try {
        const res = await marketApiService.getCandles(symbol, interval, 150);
        if (isMounted && res && res.candles) {
          setCandles(res.candles);
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setCandles([]);
          setIsLoading(false);
        }
      }
    }

    loadCandles();
    return () => {
      isMounted = false;
    };
  }, [symbol, interval]);

  // Convert Candle Array into Lightweight Charts Formats
  const processCandleData = useCallback((rawCandles: any[]) => {
    if (!rawCandles || rawCandles.length === 0) {
      return { candles: [], lines: [], volumes: [], cleanBars: [] };
    }

    const sorted = [...rawCandles].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const cData: CandlestickData[] = [];
    const lData: LineData[] = [];
    const vData: HistogramData[] = [];
    const cleanBars: any[] = [];

    const seenTimes = new Set<number>();

    for (const c of sorted) {
      const timeSec = Math.floor(new Date(c.timestamp).getTime() / 1000) as UTCTimestamp;
      if (seenTimes.has(timeSec)) continue;
      seenTimes.add(timeSec);

      const open = typeof c.open === 'string' ? parseFloat(c.open) : c.open;
      const high = typeof c.high === 'string' ? parseFloat(c.high) : c.high;
      const low = typeof c.low === 'string' ? parseFloat(c.low) : c.low;
      const close = typeof c.close === 'string' ? parseFloat(c.close) : c.close;
      const volume = typeof c.volume === 'number' ? c.volume : parseInt(c.volume || '0', 10);

      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;

      cData.push({ time: timeSec, open, high, low, close });
      lData.push({ time: timeSec, value: close });
      vData.push({
        time: timeSec,
        value: volume,
        color: close >= open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
      });

      cleanBars.push({ time: timeSec, open, high, low, close, volume });
    }

    return { candles: cData, lines: lData, volumes: vData, cleanBars };
  }, []);

  // Initialize TradingView Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Dispose previous chart
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
      priceSeriesRef.current = null;
      volumeSeriesRef.current = null;
      overlaySeriesMapRef.current.clear();
    }

    const container = chartContainerRef.current;
    const initialWidth = container.clientWidth || 800;
    const effectiveHeight = isRsiEnabled ? Math.max(280, height - 160) : height;

    const chart = createChart(container, {
      width: initialWidth,
      height: effectiveHeight,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#000000' : '#FFFFFF' },
        textColor: isDark ? '#A3A3A3' : '#4B5563',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' },
        horzLines: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#737373' : '#9CA3AF',
          width: 1,
          style: 3,
          labelBackgroundColor: isDark ? '#1F1F1F' : '#374151',
        },
        horzLine: {
          color: isDark ? '#737373' : '#9CA3AF',
          width: 1,
          style: 3,
          labelBackgroundColor: isDark ? '#1F1F1F' : '#374151',
        },
      },
      timeScale: {
        borderColor: isDark ? '#1F1F1F' : '#E5E7EB',
        timeVisible: true,
        secondsVisible: interval === '1m',
      },
      rightPriceScale: {
        borderColor: isDark ? '#1F1F1F' : '#E5E7EB',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      handleScroll: true,
      handleScale: true,
    });

    // Volume Histogram (Sub-layer at bottom)
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume_scale',
    });

    chart.priceScale('volume_scale').applyOptions({
      scaleMargins: {
        top: 0.78,
        bottom: 0.0,
      },
    });

    volumeSeriesRef.current = volumeSeries;

    // Price Series based on Chart Type
    if (chartType === 'CANDLESTICK') {
      const priceSeries = chart.addCandlestickSeries({
        upColor: '#10B981',
        downColor: '#EF4444',
        borderVisible: false,
        wickUpColor: '#10B981',
        wickDownColor: '#EF4444',
      });
      priceSeriesRef.current = priceSeries;
    } else if (chartType === 'LINE') {
      const lineSeries = chart.addLineSeries({
        color: isDark ? '#FFFFFF' : '#111827',
        lineWidth: 2,
        crosshairMarkerVisible: true,
      });
      priceSeriesRef.current = lineSeries;
    } else {
      const areaSeries = chart.addAreaSeries({
        topColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(17, 24, 39, 0.2)',
        bottomColor: isDark ? 'rgba(255, 255, 255, 0.0)' : 'rgba(17, 24, 39, 0.0)',
        lineColor: isDark ? '#FFFFFF' : '#111827',
        lineWidth: 2,
      });
      priceSeriesRef.current = areaSeries;
    }

    chartInstanceRef.current = chart;

    // Crosshair Movement Handler
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time || !priceSeriesRef.current) {
        setCrosshairInfo(null);
        return;
      }

      const priceData = param.seriesData.get(priceSeriesRef.current);
      const volumeData = volumeSeriesRef.current
        ? (param.seriesData.get(volumeSeriesRef.current) as HistogramData)
        : null;

      if (priceData) {
        let open = 0,
          high = 0,
          low = 0,
          close = 0;
        if ('open' in priceData) {
          open = (priceData as CandlestickData).open;
          high = (priceData as CandlestickData).high;
          low = (priceData as CandlestickData).low;
          close = (priceData as CandlestickData).close;
        } else if ('value' in priceData) {
          close = (priceData as LineData).value;
          open = close;
          high = close;
          low = close;
        }

        const volume = volumeData ? volumeData.value : 0;
        const change = close - open;
        const changePercent = open > 0 ? (change / open) * 100 : 0;

        let timeStr = '';
        if (typeof param.time === 'number') {
          const date = new Date((param.time as number) * 1000);
          timeStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        }

        setCrosshairInfo({
          timeStr,
          open,
          high,
          low,
          close,
          volume,
          change,
          changePercent,
        });
      }
    });

    // Auto-resizing with ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && chartInstanceRef.current) {
          chartInstanceRef.current.applyOptions({
            width: entry.contentRect.width,
          });
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [chartType, height, isRsiEnabled, isDark]);

  // Feed Historical Candles into Main Chart
  useEffect(() => {
    if (!priceSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const { candles: cData, lines: lData, volumes: vData, cleanBars } = processCandleData(candles);

    if (cleanBars && cleanBars.length > 0) {
      const last = cleanBars[cleanBars.length - 1];
      activeBarRef.current = {
        time: last.time as number,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        volume: last.volume,
      };
      setLastTickPrice(last.close);
      setLastTickTime(new Date(last.time * 1000));
    }

    if (chartType === 'LINE' || chartType === 'AREA') {
      priceSeriesRef.current.setData(lData);
    } else {
      priceSeriesRef.current.setData(cData);
    }

    volumeSeriesRef.current.setData(vData);
    chartInstanceRef.current?.timeScale().fitContent();
  }, [candles, chartType, processCandleData]);

  // REAL-TIME MARKET TICKS STREAMING & BUCKET AGGREGATION
  useEffect(() => {
    const marketChannel = `market:${symbol.toUpperCase()}`;
    socketService.subscribe(marketChannel);
    setIsLiveConnected(socketService.isConnected());

    const handlePriceUpdate = (event: any) => {
      if (!priceSeriesRef.current || !event) return;
      const rawPrice = event.price || event.lastPrice;
      const price = parseFloat(rawPrice);
      if (isNaN(price) || price <= 0) return;

      setIsLiveConnected(true);
      setLastTickTime(new Date());

      const nowSec = Math.floor(Date.now() / 1000);
      const step = INTERVAL_SECONDS[interval] || 60;
      const currentBucketTime = Math.floor(nowSec / step) * step;

      // Price Flash Indicator
      setLastTickPrice((prev) => {
        if (prev !== null) {
          if (price > prev) setPriceFlash('up');
          else if (price < prev) setPriceFlash('down');
          setTimeout(() => setPriceFlash(null), 800);
        }
        return price;
      });

      const active = activeBarRef.current;

      if (!active) {
        // Initial bar creation
        const newBar: ActiveBarState = {
          time: currentBucketTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: event.volume || 100,
        };
        activeBarRef.current = newBar;

        if (chartType === 'LINE' || chartType === 'AREA') {
          priceSeriesRef.current.update({
            time: currentBucketTime as UTCTimestamp,
            value: price,
          });
        } else {
          priceSeriesRef.current.update({
            time: currentBucketTime as UTCTimestamp,
            open: price,
            high: price,
            low: price,
            close: price,
          });
        }
        return;
      }

      if (currentBucketTime === active.time) {
        // Update active candle within current interval bucket!
        active.high = Math.max(active.high, price);
        active.low = Math.min(active.low, price);
        active.close = price;
        active.volume += 30;

        if (chartType === 'LINE' || chartType === 'AREA') {
          priceSeriesRef.current.update({
            time: active.time as UTCTimestamp,
            value: price,
          });
        } else {
          priceSeriesRef.current.update({
            time: active.time as UTCTimestamp,
            open: active.open,
            high: active.high,
            low: active.low,
            close: active.close,
          });
        }

        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.update({
            time: active.time as UTCTimestamp,
            value: active.volume,
            color: active.close >= active.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
          });
        }
      } else if (currentBucketTime > active.time) {
        // Progress into next candle interval bucket!
        const nextBar: ActiveBarState = {
          time: currentBucketTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 50,
        };
        activeBarRef.current = nextBar;

        if (chartType === 'LINE' || chartType === 'AREA') {
          priceSeriesRef.current.update({
            time: currentBucketTime as UTCTimestamp,
            value: price,
          });
        } else {
          priceSeriesRef.current.update({
            time: currentBucketTime as UTCTimestamp,
            open: price,
            high: price,
            low: price,
            close: price,
          });
        }

        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.update({
            time: currentBucketTime as UTCTimestamp,
            value: nextBar.volume,
            color: 'rgba(16, 185, 129, 0.5)',
          });
        }
      }
    };

    socketService.on('market:price_update', handlePriceUpdate);
    socketService.on('market:quote', handlePriceUpdate);

    return () => {
      socketService.unsubscribe(marketChannel);
      socketService.off('market:price_update', handlePriceUpdate);
      socketService.off('market:quote', handlePriceUpdate);
    };
  }, [symbol, interval, chartType]);

  const handleResetZoom = () => {
    chartInstanceRef.current?.timeScale().fitContent();
  };

  const toggleIndicator = (id: string) => {
    setIndicators((prev) =>
      prev.map((ind) => (ind.id === id ? { ...ind, enabled: !ind.enabled } : ind))
    );
  };

  return (
    <div
      ref={containerWrapperRef}
      className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-2xl overflow-hidden shadow-sm flex flex-col relative select-none font-sans"
    >
      {/* Top Chart Toolbar */}
      {showToolbar && (
        <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-[#1F1F1F] bg-slate-50 dark:bg-[#0D0D0D] flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Left: Timeframe Switcher & Chart Type */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 dark:text-neutral-500 uppercase font-bold mr-1">
              Interval
            </span>
            {(['1m', '5m', '15m', '1h', '1d'] as CandleInterval[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setIntervalState(tf)}
                className={`px-2 py-1 rounded-lg text-xs font-semibold uppercase transition-colors font-mono ${
                  interval === tf
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-black shadow-sm'
                    : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#1A1A1A]'
                }`}
              >
                {tf}
              </button>
            ))}

            <div className="h-4 w-px bg-slate-200 dark:bg-[#262626] mx-1" />

            {/* Chart Type Selector */}
            <div className="flex items-center gap-0.5 bg-slate-200/80 dark:bg-[#171717] p-0.5 rounded-xl border border-slate-200 dark:border-[#262626]">
              {(['CANDLESTICK', 'LINE', 'AREA'] as ChartType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={`px-2 py-0.5 rounded-lg text-xs font-medium transition-colors ${
                    chartType === type
                      ? 'bg-white dark:bg-[#2A2A2A] text-slate-900 dark:text-white font-bold shadow-sm'
                      : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {type === 'CANDLESTICK' ? 'Candles' : type === 'LINE' ? 'Line' : 'Area'}
                </button>
              ))}
            </div>

            {/* Quick Indicator Toggles */}
            <div className="flex items-center gap-1 ml-2">
              {indicators.slice(0, 3).map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => toggleIndicator(ind.id)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-colors ${
                    ind.enabled
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-black border-transparent font-semibold shadow-sm'
                      : 'border-slate-200 dark:border-[#262626] text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {ind.type}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Status Pill & Indicators */}
          <div className="flex items-center gap-2">
            {/* Live WebSocket Indicator */}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-mono font-semibold ${
                isLiveConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400'
              }`}
            >
              {isLiveConnected ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-500 animate-pulse" />
                  <span>STREAMING</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-amber-500" />
                  <span>IDLE</span>
                </>
              )}
            </div>

            {/* Reset Zoom */}
            <button
              onClick={handleResetZoom}
              title="Reset Zoom / Fit Content"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Real-Time Crosshair & Price HUD Bar */}
      <div className="px-3.5 py-1.5 bg-white/95 dark:bg-[#0A0A0A]/95 border-b border-slate-100 dark:border-[#1F1F1F] flex items-center justify-between text-xs font-mono tabular-nums overflow-x-auto min-h-[32px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white font-sans">
            <span>{symbol}</span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                dataClassification === 'REAL'
                  ? 'bg-slate-100 dark:bg-[#1A1A1A] text-slate-700 dark:text-neutral-300 border border-slate-200 dark:border-[#2E2E2E]'
                  : 'bg-slate-100 dark:bg-[#141414] text-slate-700 dark:text-neutral-300 border border-slate-200 dark:border-[#262626]'
              }`}
            >
              {dataClassification}
            </span>
          </div>

          {/* Current Live Tick Price Flash */}
          {lastTickPrice !== null && (
            <div
              className={`flex items-center gap-1 font-bold text-sm px-2 py-0.5 rounded-lg transition-all duration-300 ${
                priceFlash === 'up'
                  ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                  : priceFlash === 'down'
                  ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              <span>{formatCurrency(lastTickPrice)}</span>
            </div>
          )}
        </div>

        {/* Crosshair Values or Latest Bar Summary */}
        <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-slate-500 dark:text-neutral-400">
          {crosshairInfo ? (
            <>
              <span className="text-slate-400 hidden md:inline">{crosshairInfo.timeStr}</span>
              <div>
                <span className="text-slate-400 dark:text-neutral-500 mr-1">O:</span>
                <span className="text-slate-900 dark:text-white font-semibold">
                  {crosshairInfo.open.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-neutral-500 mr-1">H:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {crosshairInfo.high.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-neutral-500 mr-1">L:</span>
                <span className="text-rose-600 dark:text-rose-400 font-semibold">
                  {crosshairInfo.low.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-neutral-500 mr-1">C:</span>
                <span className="text-slate-900 dark:text-white font-semibold">
                  {crosshairInfo.close.toFixed(2)}
                </span>
              </div>
              <div
                className={`font-semibold ${
                  crosshairInfo.change >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                <span>
                  {crosshairInfo.change >= 0 ? '+' : ''}
                  {crosshairInfo.change.toFixed(2)} ({crosshairInfo.changePercent.toFixed(2)}%)
                </span>
              </div>
            </>
          ) : activeBarRef.current ? (
            <>
              <div>
                <span className="text-slate-400 dark:text-neutral-500 mr-1">O:</span>
                <span className="text-slate-900 dark:text-white font-semibold">
                  {activeBarRef.current.open.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-neutral-500 mr-1">H:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {activeBarRef.current.high.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-neutral-500 mr-1">L:</span>
                <span className="text-rose-600 dark:text-rose-400 font-semibold">
                  {activeBarRef.current.low.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-neutral-500 mr-1">C:</span>
                <span className="text-slate-900 dark:text-white font-semibold">
                  {activeBarRef.current.close.toFixed(2)}
                </span>
              </div>
              {lastTickTime && (
                <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 dark:text-neutral-500">
                  <Clock className="w-3 h-3" />
                  <span>{lastTickTime.toLocaleTimeString()}</span>
                </div>
              )}
            </>
          ) : (
            <span className="text-slate-400">Streaming live market ticks...</span>
          )}
        </div>
      </div>

      {/* Main Chart Canvas Container */}
      <div className="relative w-full flex-1 min-h-[300px]">
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-2 text-slate-900 dark:text-white font-sans text-xs">
            <RefreshCw className="w-5 h-5 animate-spin text-slate-900 dark:text-white" />
            <span>Loading {symbol} candles...</span>
          </div>
        )}

        <div ref={chartContainerRef} className="w-full h-full" />
      </div>

      {/* RSI Sub-Panel Canvas */}
      {isRsiEnabled && (
        <div className="border-t border-slate-200 dark:border-[#1F1F1F] bg-slate-50 dark:bg-[#0D0D0D] flex flex-col">
          <div className="px-3 py-1 flex items-center justify-between text-[10px] font-sans text-slate-700 dark:text-neutral-300 font-semibold border-b border-slate-100 dark:border-[#1F1F1F]">
            <span>RSI (14) OSCILLATOR</span>
            <span className="text-slate-400">OB: 70 • OS: 30</span>
          </div>
          <div ref={rsiContainerRef} className="w-full h-[140px]" />
        </div>
      )}
    </div>
  );
};
