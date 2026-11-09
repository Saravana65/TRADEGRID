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
import { formatCurrency, formatNumber } from '../../utils/formatters';
import {
  RotateCcw,
  RefreshCw,
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
  // Container refs
  const containerWrapperRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);

  // Chart & Series instances
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlaySeriesMapRef = useRef<Map<string, ISeriesApi<any>>>(new Map());

  // Sub-chart instances (RSI)
  const rsiChartRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Active bar tracking for realtime streaming merging
  const activeBarRef = useRef<ActiveBarState | null>(null);

  // State
  const [interval, setIntervalState] = useState<CandleInterval>('1d');
  const [chartType, setChartType] = useState<ChartType>('CANDLESTICK');
  const [candles, setCandles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastTickPrice, setLastTickPrice] = useState<number | null>(null);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

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
      style: { color: '#06B6D4', lineWidth: 2 },
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
      style: { color: '#A855F7', lineWidth: 1, secondaryColor: '#6366F1' },
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
          if (pref.indicatorsConfig && pref.indicatorsConfig.length > 0) {
            setIndicators(pref.indicatorsConfig);
          }
        }
      } catch {
        // Fallback to defaults
      }
    }
    loadPreferences();
    return () => {
      isMounted = false;
    };
  }, [symbol]);

  // Load Historical Candles
  const loadCandles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await marketApiService.getCandles(symbol, interval, 300);
      let loaded = data?.candles || [];

      // Fallback: If no historical candles exist (new stock or cold start), create a realistic initial synthetic baseline
      if (loaded.length === 0) {
        const basePrice = 250.0;
        const now = Math.floor(Date.now() / 1000);
        const step = INTERVAL_SECONDS[interval] || 86400;
        const synthetic = [];
        let curr = basePrice;
        for (let i = 60; i >= 0; i--) {
          const delta = (Math.random() - 0.49) * 2;
          const open = curr;
          curr = Math.max(10, curr + delta);
          const high = Math.max(open, curr) + Math.random() * 1.5;
          const low = Math.min(open, curr) - Math.random() * 1.5;
          synthetic.push({
            timestamp: new Date((now - i * step) * 1000).toISOString(),
            open: open.toFixed(2),
            high: high.toFixed(2),
            low: low.toFixed(2),
            close: curr.toFixed(2),
            volume: Math.floor(Math.random() * 50000 + 10000).toString(),
          });
        }
        loaded = synthetic;
      }

      setCandles(loaded);
    } catch {
      // Keep existing candles
    } finally {
      setIsLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    loadCandles();
  }, [loadCandles]);

  // Helper to normalize and deduplicate candles
  const processCandleData = useCallback((rawCandles: any[]) => {
    if (!rawCandles || rawCandles.length === 0) {
      return {
        candles: [] as CandlestickData[],
        lines: [] as LineData[],
        volumes: [] as HistogramData[],
        cleanBars: [] as Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number }>,
      };
    }

    const parsed = rawCandles.map((c) => {
      const timeMs = new Date(c.timestamp).getTime();
      const timeSec = (isNaN(timeMs) ? Math.floor(Date.now() / 1000) : Math.floor(timeMs / 1000)) as UTCTimestamp;
      const open = parseFloat(c.open) || 0;
      const high = parseFloat(c.high) || open;
      const low = parseFloat(c.low) || open;
      const close = parseFloat(c.close) || open;
      const volume = parseFloat(c.volume) || 0;
      return { time: timeSec, open, high, low, close, volume };
    });

    // Strictly sort ascending by timestamp
    parsed.sort((a, b) => (a.time as number) - (b.time as number));

    // Deduplicate duplicate timestamps (Lightweight Charts requirement: strictly ascending)
    const map = new Map<number, (typeof parsed)[0]>();
    for (const item of parsed) {
      map.set(item.time as number, item);
    }
    const clean = Array.from(map.values()).sort((a, b) => (a.time as number) - (b.time as number));

    const candlesData: CandlestickData[] = [];
    const linesData: LineData[] = [];
    const volumesData: HistogramData[] = [];

    for (const c of clean) {
      candlesData.push({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      });

      linesData.push({
        time: c.time,
        value: c.close,
      });

      volumesData.push({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)',
      });
    }

    return { candles: candlesData, lines: linesData, volumes: volumesData, cleanBars: clean };
  }, []);

  // Initialize and Mount Main Chart
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
        background: { type: ColorType.Solid, color: '#090D16' },
        textColor: '#94A3B8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.45)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.45)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#06B6D4',
          width: 1,
          style: 3,
          labelBackgroundColor: '#0E1726',
        },
        horzLine: {
          color: '#06B6D4',
          width: 1,
          style: 3,
          labelBackgroundColor: '#0E1726',
        },
      },
      timeScale: {
        borderColor: '#1E293B',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1E293B',
        scaleMargins: {
          top: 0.1,
          bottom: 0.22,
        },
      },
    });

    // Create price series based on chartType
    let priceSeries: ISeriesApi<any>;
    if (chartType === 'LINE') {
      priceSeries = chart.addLineSeries({
        color: '#06B6D4',
        lineWidth: 2,
        priceLineColor: '#06B6D4',
      });
    } else if (chartType === 'AREA') {
      priceSeries = chart.addAreaSeries({
        topColor: 'rgba(6, 182, 212, 0.4)',
        bottomColor: 'rgba(6, 182, 212, 0.02)',
        lineColor: '#06B6D4',
        lineWidth: 2,
        priceLineColor: '#06B6D4',
      });
    } else {
      // CANDLESTICK default
      priceSeries = chart.addCandlestickSeries({
        upColor: '#10B981',
        downColor: '#EF4444',
        borderVisible: false,
        wickUpColor: '#10B981',
        wickDownColor: '#EF4444',
      });
    }

    // Add Volume series on secondary price scale
    const volSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.78,
        bottom: 0,
      },
    });

    chartInstanceRef.current = chart;
    priceSeriesRef.current = priceSeries;
    volumeSeriesRef.current = volSeries;

    // Crosshair movement subscription for live HUD
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setCrosshairInfo(null);
        return;
      }

      const barData: any = param.seriesData.get(priceSeries);
      const volData: any = param.seriesData.get(volSeries);

      if (barData) {
        const open = barData.open !== undefined ? barData.open : barData.value;
        const close = barData.close !== undefined ? barData.close : barData.value;
        const high = barData.high !== undefined ? barData.high : close;
        const low = barData.low !== undefined ? barData.low : close;
        const change = close - open;
        const changePercent = open > 0 ? (change / open) * 100 : 0;
        const volume = volData?.value || 0;

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

    // ResizeObserver for robust auto-sizing
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
  }, [chartType, height, isRsiEnabled]);

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
    }

    if (chartType === 'LINE' || chartType === 'AREA') {
      priceSeriesRef.current.setData(lData);
    } else {
      priceSeriesRef.current.setData(cData);
    }

    volumeSeriesRef.current.setData(vData);
    chartInstanceRef.current?.timeScale().fitContent();
  }, [candles, chartType, processCandleData]);

  // Compute and Render Overlays (SMA, EMA, Bollinger Bands, VWAP)
  useEffect(() => {
    if (!chartInstanceRef.current || candles.length === 0) return;

    const overlayIndicators = indicators.filter((i) => i.enabled && i.panel === 'OVERLAY');
    if (overlayIndicators.length === 0) {
      overlaySeriesMapRef.current.forEach((series) => {
        chartInstanceRef.current?.removeSeries(series);
      });
      overlaySeriesMapRef.current.clear();
      return;
    }

    let isMounted = true;
    async function updateOverlays() {
      try {
        const res = await chartingApiService.calculateIndicators(symbol, interval, overlayIndicators);
        if (!isMounted || !chartInstanceRef.current) return;

        // Clear existing overlays
        overlaySeriesMapRef.current.forEach((series) => {
          chartInstanceRef.current?.removeSeries(series);
        });
        overlaySeriesMapRef.current.clear();

        for (const s of res.series) {
          const cfg = overlayIndicators.find((i) => i.id === s.indicatorId);
          if (!cfg) continue;

          if (s.type === 'BOLLINGER_BANDS') {
            const upperSeries = chartInstanceRef.current.addLineSeries({
              color: cfg.style?.color || '#A855F7',
              lineWidth: 1,
              title: `${cfg.id} Upper`,
            });
            const midSeries = chartInstanceRef.current.addLineSeries({
              color: cfg.style?.secondaryColor || '#6366F1',
              lineWidth: 1,
              title: `${cfg.id} Mid`,
            });
            const lowerSeries = chartInstanceRef.current.addLineSeries({
              color: cfg.style?.color || '#A855F7',
              lineWidth: 1,
              title: `${cfg.id} Lower`,
            });

            const upperData: LineData[] = [];
            const midData: LineData[] = [];
            const lowerData: LineData[] = [];

            for (let i = 0; i < s.timestamps.length; i++) {
              const t = Math.floor(new Date(s.timestamps[i]).getTime() / 1000) as UTCTimestamp;
              const u = s.data.upper?.[i];
              const m = s.data.middle?.[i];
              const l = s.data.lower?.[i];
              if (u !== null && u !== undefined) upperData.push({ time: t, value: u });
              if (m !== null && m !== undefined) midData.push({ time: t, value: m });
              if (l !== null && l !== undefined) lowerData.push({ time: t, value: l });
            }

            upperSeries.setData(upperData);
            midSeries.setData(midData);
            lowerSeries.setData(lowerData);

            overlaySeriesMapRef.current.set(`${s.indicatorId}_upper`, upperSeries);
            overlaySeriesMapRef.current.set(`${s.indicatorId}_mid`, midSeries);
            overlaySeriesMapRef.current.set(`${s.indicatorId}_lower`, lowerSeries);
          } else {
            // Single line indicators (SMA, EMA, VWAP)
            const lineSeries = chartInstanceRef.current.addLineSeries({
              color: cfg.style?.color || '#06B6D4',
              lineWidth: (cfg.style?.lineWidth as any) || 2,
              title: cfg.id.toUpperCase(),
            });

            const lineData: LineData[] = [];
            for (let i = 0; i < s.timestamps.length; i++) {
              const t = Math.floor(new Date(s.timestamps[i]).getTime() / 1000) as UTCTimestamp;
              const v = s.data.values?.[i];
              if (v !== null && v !== undefined && !isNaN(v)) {
                lineData.push({ time: t, value: v });
              }
            }

            lineSeries.setData(lineData);
            overlaySeriesMapRef.current.set(s.indicatorId, lineSeries);
          }
        }
      } catch {
        // Overlay fallback
      }
    }

    updateOverlays();
    return () => {
      isMounted = false;
    };
  }, [symbol, interval, indicators, candles.length]);

  // Sub-chart: RSI Panel Mount & Render
  useEffect(() => {
    if (!isRsiEnabled || !rsiContainerRef.current) {
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
        rsiSeriesRef.current = null;
      }
      return;
    }

    const container = rsiContainerRef.current;
    const rsiChart = createChart(container, {
      width: container.clientWidth || 800,
      height: 140,
      layout: {
        background: { type: ColorType.Solid, color: '#070A12' },
        textColor: '#94A3B8',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.3)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.3)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor: '#1E293B',
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: '#1E293B',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
    });

    const rsiSeries = rsiChart.addLineSeries({
      color: '#EC4899',
      lineWidth: 2,
      priceLineVisible: true,
      title: 'RSI(14)',
    });

    // Reference lines for Overbought (70) and Oversold (30)
    rsiSeries.createPriceLine({
      price: 70,
      color: '#EF4444',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'OB 70',
    });

    rsiSeries.createPriceLine({
      price: 30,
      color: '#10B981',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'OS 30',
    });

    rsiChartRef.current = rsiChart;
    rsiSeriesRef.current = rsiSeries;

    // Fetch and populate RSI data
    const rsiConfig = indicators.find((i) => i.id === 'rsi-14' && i.enabled);
    if (rsiConfig && candles.length > 0) {
      chartingApiService
        .calculateIndicators(symbol, interval, [rsiConfig])
        .then((res) => {
          if (res.series[0]?.data.values && rsiSeriesRef.current) {
            const data: LineData[] = [];
            for (let i = 0; i < res.series[0].timestamps.length; i++) {
              const val = res.series[0].data.values[i];
              if (val !== null && val !== undefined && !isNaN(val)) {
                data.push({
                  time: Math.floor(new Date(res.series[0].timestamps[i]).getTime() / 1000) as UTCTimestamp,
                  value: val,
                });
              }
            }
            rsiSeriesRef.current.setData(data);
            rsiChart.timeScale().fitContent();
          }
        })
        .catch(() => {});
    }

    const rsiObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && rsiChartRef.current) {
          rsiChartRef.current.applyOptions({ width: entry.contentRect.width });
        }
      }
    });
    rsiObserver.observe(container);

    return () => {
      rsiObserver.disconnect();
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
        rsiSeriesRef.current = null;
      }
    };
  }, [isRsiEnabled, symbol, interval, candles.length, indicators]);

  // Real-time Market Ticks Streaming & Bucket Aggregation
  useEffect(() => {
    const marketChannel = `market:${symbol.toUpperCase()}`;
    socketService.subscribe(marketChannel);

    const handlePriceUpdate = (event: any) => {
      if (!priceSeriesRef.current || !event) return;
      const rawPrice = event.price || event.lastPrice;
      const price = parseFloat(rawPrice);
      if (isNaN(price) || price <= 0) return;

      const nowSec = Math.floor(Date.now() / 1000);
      const step = INTERVAL_SECONDS[interval] || 86400;
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
        // First bar creation
        const newBar: ActiveBarState = {
          time: currentBucketTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 100,
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
        // Update active candle within current bucket
        active.high = Math.max(active.high, price);
        active.low = Math.min(active.low, price);
        active.close = price;
        active.volume += 25;

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
            color: active.close >= active.open ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)',
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
            color: 'rgba(16, 185, 129, 0.45)',
          });
        }
      }
    };

    socketService.on('market:price_update', handlePriceUpdate);

    return () => {
      socketService.unsubscribe(marketChannel);
      socketService.off('market:price_update', handlePriceUpdate);
    };
  }, [symbol, interval, chartType]);

  // Toggle Indicator Helper
  const toggleIndicator = (id: string) => {
    setIndicators((prev) =>
      prev.map((ind) => (ind.id === id ? { ...ind, enabled: !ind.enabled } : ind))
    );
  };

  // Reset View to fit Content
  const handleResetZoom = () => {
    chartInstanceRef.current?.timeScale().fitContent();
    rsiChartRef.current?.timeScale().fitContent();
  };

  return (
    <div
      ref={containerWrapperRef}
      className="bg-[#090D16] border border-card-border rounded-xl overflow-hidden shadow-2xl flex flex-col relative select-none"
    >
      {/* Top Chart Toolbar */}
      {showToolbar && (
        <div className="px-3 py-2 border-b border-card-border bg-[#0B0F19] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          {/* Left: Timeframe Switcher & Chart Type */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500 uppercase font-semibold mr-1">Timeframe</span>
            {(['1m', '5m', '15m', '1h', '1d'] as CandleInterval[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setIntervalState(tf)}
                className={`px-2 py-1 rounded text-xs font-semibold uppercase transition-colors ${
                  interval === tf
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tf}
              </button>
            ))}

            <div className="h-4 w-px bg-card-border mx-1.5" />

            {/* Chart Type Selector */}
            <div className="flex items-center gap-0.5 bg-slate-900/80 p-0.5 rounded-lg border border-card-border">
              {(['CANDLESTICK', 'LINE', 'AREA'] as ChartType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    chartType === type
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {type === 'CANDLESTICK' ? 'Candles' : type === 'LINE' ? 'Line' : 'Area'}
                </button>
              ))}
            </div>
          </div>

          {/* Center / Right: Indicator Toggles */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-500 uppercase font-semibold mr-1 hidden sm:inline">
              Indicators
            </span>

            {indicators.map((ind) => {
              const label =
                ind.id === 'sma-20'
                  ? 'SMA 20'
                  : ind.id === 'ema-50'
                  ? 'EMA 50'
                  : ind.id === 'bb-20'
                  ? 'Bollinger'
                  : ind.id === 'vwap-session'
                  ? 'VWAP'
                  : ind.id === 'rsi-14'
                  ? 'RSI 14'
                  : ind.id;

              return (
                <button
                  key={ind.id}
                  onClick={() => toggleIndicator(ind.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-all ${
                    ind.enabled
                      ? 'bg-slate-800 text-cyan-300 border-cyan-500/50 shadow-sm'
                      : 'bg-transparent text-slate-400 border-transparent hover:border-slate-700 hover:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              );
            })}

            <div className="h-4 w-px bg-card-border mx-1 hidden sm:block" />

            <button
              onClick={handleResetZoom}
              title="Reset Zoom / Fit Content"
              className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Real-Time Crosshair HUD Bar */}
      <div className="px-3 py-1.5 bg-[#090D16]/95 border-b border-card-border/60 flex items-center justify-between text-xs font-mono tabular-nums overflow-x-auto min-h-[30px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-slate-200">
            <span>{symbol}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded border uppercase font-mono ${
                dataClassification === 'REAL'
                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400'
                  : 'bg-purple-950/60 border-purple-700/60 text-purple-300'
              }`}
            >
              {dataClassification}
            </span>
          </div>

          {/* Current Live Tick Price Flash */}
          {lastTickPrice !== null && (
            <div
              className={`flex items-center gap-1 font-bold text-sm px-1.5 py-0.5 rounded transition-all duration-300 ${
                priceFlash === 'up'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : priceFlash === 'down'
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'text-slate-100'
              }`}
            >
              <span>{formatCurrency(lastTickPrice)}</span>
            </div>
          )}
        </div>

        {/* Crosshair Values or Latest Bar Summary */}
        <div className="flex items-center gap-2 sm:gap-3 text-[11px] text-slate-400">
          {crosshairInfo ? (
            <>
              <span className="text-slate-500 hidden md:inline">{crosshairInfo.timeStr}</span>
              <div>
                <span className="text-slate-500 mr-1">O:</span>
                <span className="text-slate-200 font-semibold">{crosshairInfo.open.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 mr-1">H:</span>
                <span className="text-emerald-400 font-semibold">{crosshairInfo.high.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 mr-1">L:</span>
                <span className="text-rose-400 font-semibold">{crosshairInfo.low.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 mr-1">C:</span>
                <span className="text-slate-200 font-semibold">{crosshairInfo.close.toFixed(2)}</span>
              </div>
              <div
                className={`font-semibold ${
                  crosshairInfo.change >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                <span>
                  {crosshairInfo.change >= 0 ? '+' : ''}
                  {crosshairInfo.change.toFixed(2)} ({crosshairInfo.changePercent.toFixed(2)}%)
                </span>
              </div>
              {crosshairInfo.volume > 0 && (
                <div className="hidden lg:block text-slate-400">
                  <span className="text-slate-500 mr-1">Vol:</span>
                  <span className="text-cyan-400">{formatNumber(crosshairInfo.volume)}</span>
                </div>
              )}
            </>
          ) : activeBarRef.current ? (
            <>
              <div>
                <span className="text-slate-500 mr-1">O:</span>
                <span className="text-slate-200">{activeBarRef.current.open.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 mr-1">H:</span>
                <span className="text-emerald-400">{activeBarRef.current.high.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 mr-1">L:</span>
                <span className="text-rose-400">{activeBarRef.current.low.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 mr-1">C:</span>
                <span className="text-slate-200 font-semibold">{activeBarRef.current.close.toFixed(2)}</span>
              </div>
              {activeBarRef.current.volume > 0 && (
                <div className="hidden sm:block">
                  <span className="text-slate-500 mr-1">Vol:</span>
                  <span className="text-cyan-400">{formatNumber(activeBarRef.current.volume)}</span>
                </div>
              )}
            </>
          ) : (
            <span className="text-slate-500">Streaming live market ticks...</span>
          )}
        </div>
      </div>

      {/* Main Chart Canvas Container */}
      <div className="relative w-full flex-1 min-h-[300px]">
        {isLoading && (
          <div className="absolute inset-0 bg-[#090D16]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-2 text-cyan-400 font-mono text-xs">
            <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
            <span>Loading {symbol} historical candles...</span>
          </div>
        )}

        <div ref={chartContainerRef} className="w-full h-full" />
      </div>

      {/* RSI Sub-Panel Canvas */}
      {isRsiEnabled && (
        <div className="border-t border-card-border bg-[#070A12] flex flex-col">
          <div className="px-3 py-1 flex items-center justify-between text-[10px] font-mono text-pink-400 font-semibold border-b border-card-border/40">
            <span>RSI (14) OSCILLATOR</span>
            <span className="text-slate-500">OB: 70 • OS: 30</span>
          </div>
          <div ref={rsiContainerRef} className="w-full h-[140px]" />
        </div>
      )}
    </div>
  );
};
