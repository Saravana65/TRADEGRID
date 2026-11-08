import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  HistogramData,
  Time,
  ColorType,
} from 'lightweight-charts';
import {
  ChartType,
  CandleInterval,
  IndicatorConfig,
  VolumeProfileConfig,
  VolumeProfileData,
} from '@tradegrid/shared-types';
import { chartingApiService } from '../../services/charting.service';
import { marketApiService } from '../../services/market.service';
import { socketService } from '../../services/socket.service';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import {
  Save,
  RotateCcw,
  BarChart2,
  Check,
  Info,
  X,
  Sliders,
} from 'lucide-react';

interface AdvancedTradingChartProps {
  symbol: string;
  height?: number;
  showToolbar?: boolean;
  onSymbolChange?: (symbol: string) => void;
}

export const AdvancedTradingChart: React.FC<AdvancedTradingChartProps> = ({
  symbol,
  height = 550,
  showToolbar = true,
}) => {
  // Container refs
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);

  // Chart & Series instances
  const mainChartRef = useRef<IChartApi | null>(null);
  const mainPriceSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const overlaySeriesMapRef = useRef<Map<string, ISeriesApi<any>>>(new Map());

  // Sub-chart instances
  const rsiChartRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // State
  const [interval, setIntervalState] = useState<CandleInterval>('1d');
  const [chartType, setChartType] = useState<ChartType>('CANDLESTICK');
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([]);
  const [volumeProfileConfig, setVolumeProfileConfig] = useState<VolumeProfileConfig>({
    enabled: false,
    binsCount: 24,
    valueAreaPercent: 70,
    pocColor: '#F59E0B',
    valueAreaColor: 'rgba(59, 130, 246, 0.4)',
    nonValueAreaColor: 'rgba(107, 114, 128, 0.2)',
    showLabels: true,
  });

  const [volumeProfileData, setVolumeProfileData] = useState<VolumeProfileData | null>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'indicators' | 'volumeProfile'>('indicators');

  // Load User Preferences from server
  useEffect(() => {
    let isMounted = true;
    async function loadPreferences() {
      try {
        const pref = await chartingApiService.getPreferences(symbol);
        if (isMounted && pref) {
          setIntervalState((pref.interval as CandleInterval) || '1d');
          setChartType(pref.chartType || 'CANDLESTICK');
          if (pref.indicatorsConfig && pref.indicatorsConfig.length > 0) {
            setIndicators(pref.indicatorsConfig);
          }
          if (pref.volumeProfileConfig) {
            setVolumeProfileConfig(pref.volumeProfileConfig);
          }
        }
      } catch (err) {
        console.warn('Using default chart configuration', err);
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
      setCandles(data?.candles || []);
    } catch (err) {
      console.error('Failed to load chart candles', err);
    } finally {
      setIsLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    loadCandles();
  }, [loadCandles]);

  // Load Volume Profile when enabled
  useEffect(() => {
    if (!volumeProfileConfig.enabled) {
      setVolumeProfileData(null);
      return;
    }
    let isMounted = true;
    async function fetchVP() {
      try {
        const vp = await chartingApiService.getVolumeProfile(
          symbol,
          interval,
          volumeProfileConfig.binsCount,
          volumeProfileConfig.valueAreaPercent
        );
        if (isMounted) {
          setVolumeProfileData(vp);
        }
      } catch (err) {
        console.error('Failed to load volume profile', err);
      }
    }
    fetchVP();
    return () => {
      isMounted = false;
    };
  }, [symbol, interval, volumeProfileConfig.enabled, volumeProfileConfig.binsCount, volumeProfileConfig.valueAreaPercent]);


  // Initialize or recreate Main Chart
  useEffect(() => {
    if (!mainContainerRef.current) return;

    // Dispose old chart
    if (mainChartRef.current) {
      mainChartRef.current.remove();
      mainChartRef.current = null;
      overlaySeriesMapRef.current.clear();
    }

    const container = mainContainerRef.current;
    const isSubChartOpen = indicators.some((i) => i.enabled && i.panel === 'SEPARATE');
    const mainHeight = isSubChartOpen ? Math.max(300, height - 180) : height;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: mainHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#0B0F19' },
        textColor: '#94A3B8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.5)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.5)' },
      },
      crosshair: {
        vertLine: { color: '#38BDF8', width: 1, style: 3 },
        horzLine: { color: '#38BDF8', width: 1, style: 3 },
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
          bottom: 0.25,
        },
      },
    });

    // Create Main Price Series based on selected chartType
    let priceSeries: ISeriesApi<any>;
    if (chartType === 'LINE') {
      priceSeries = chart.addLineSeries({
        color: '#38BDF8',
        lineWidth: 2,
      });
    } else if (chartType === 'AREA') {
      priceSeries = chart.addAreaSeries({
        topColor: 'rgba(56, 189, 248, 0.4)',
        bottomColor: 'rgba(56, 189, 248, 0.0)',
        lineColor: '#38BDF8',
        lineWidth: 2,
      });
    } else {
      // CANDLESTICK or BAR
      priceSeries = chart.addCandlestickSeries({
        upColor: '#10B981',
        downColor: '#EF4444',
        borderVisible: false,
        wickUpColor: '#10B981',
        wickDownColor: '#EF4444',
      });
    }

    // Add Volume Histogram Subseries on priceScale ''
    const volSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    mainChartRef.current = chart;
    mainPriceSeriesRef.current = priceSeries;
    volumeSeriesRef.current = volSeries;

    // Responsive resize handler
    const handleResize = () => {
      if (mainContainerRef.current && mainChartRef.current) {
        mainChartRef.current.applyOptions({
          width: mainContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (mainChartRef.current) {
        mainChartRef.current.remove();
        mainChartRef.current = null;
      }
    };
  }, [chartType, height, indicators]);

  // Feed Candles to Main Chart & Volume Series
  useEffect(() => {
    if (!mainPriceSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    // Convert candles for Lightweight Charts
    const formattedCandles: CandlestickData[] = [];
    const formattedLines: LineData[] = [];
    const formattedVolume: HistogramData[] = [];

    // Sort ascending by timestamp
    const sorted = [...candles].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (const c of sorted) {
      const timeInSec = Math.floor(new Date(c.timestamp).getTime() / 1000) as Time;
      const open = parseFloat(c.open);
      const high = parseFloat(c.high);
      const low = parseFloat(c.low);
      const close = parseFloat(c.close);
      const vol = parseFloat(c.volume);

      formattedCandles.push({
        time: timeInSec,
        open,
        high,
        low,
        close,
      });

      formattedLines.push({
        time: timeInSec,
        value: close,
      });

      formattedVolume.push({
        time: timeInSec,
        value: vol,
        color: close >= open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
      });
    }

    if (chartType === 'LINE' || chartType === 'AREA') {
      mainPriceSeriesRef.current.setData(formattedLines);
    } else {
      mainPriceSeriesRef.current.setData(formattedCandles);
    }

    volumeSeriesRef.current.setData(formattedVolume);
    mainChartRef.current?.timeScale().fitContent();
  }, [candles, chartType]);

  // Calculate & Render Overlays (SMA, EMA, Bollinger Bands, VWAP)
  useEffect(() => {
    if (!mainChartRef.current || candles.length === 0) return;

    const overlayIndicators = indicators.filter((i) => i.enabled && i.panel === 'OVERLAY');
    if (overlayIndicators.length === 0) {
      overlaySeriesMapRef.current.forEach((series) => {
        mainChartRef.current?.removeSeries(series);
      });
      overlaySeriesMapRef.current.clear();
      return;
    }

    let isMounted = true;
    async function calculateOverlays() {
      try {
        const res = await chartingApiService.calculateIndicators(symbol, interval, overlayIndicators);
        if (!isMounted || !mainChartRef.current) return;

        // Clear previous overlays
        overlaySeriesMapRef.current.forEach((series) => {
          mainChartRef.current?.removeSeries(series);
        });
        overlaySeriesMapRef.current.clear();

        for (const s of res.series) {
          const cfg = overlayIndicators.find((i) => i.id === s.indicatorId);
          if (!cfg) continue;

          if (s.type === 'BOLLINGER_BANDS') {
            // Upper band
            const upperSeries = mainChartRef.current.addLineSeries({
              color: cfg.style.color || '#8B5CF6',
              lineWidth: 1,
              title: `${cfg.id} Upper`,
            });
            // Middle band
            const midSeries = mainChartRef.current.addLineSeries({
              color: cfg.style.secondaryColor || '#6366F1',
              lineWidth: 1,
              title: `${cfg.id} Mid`,
            });
            // Lower band
            const lowerSeries = mainChartRef.current.addLineSeries({
              color: cfg.style.tertiaryColor || '#4F46E5',
              lineWidth: 1,
              title: `${cfg.id} Lower`,
            });

            const upperData: LineData[] = [];
            const midData: LineData[] = [];
            const lowerData: LineData[] = [];

            for (let idx = 0; idx < s.timestamps.length; idx++) {
              const timeSec = Math.floor(new Date(s.timestamps[idx]).getTime() / 1000) as Time;
              if (s.data.upper?.[idx] !== null && s.data.upper?.[idx] !== undefined) {
                upperData.push({ time: timeSec, value: s.data.upper[idx] as number });
              }
              if (s.data.middle?.[idx] !== null && s.data.middle?.[idx] !== undefined) {
                midData.push({ time: timeSec, value: s.data.middle[idx] as number });
              }
              if (s.data.lower?.[idx] !== null && s.data.lower?.[idx] !== undefined) {
                lowerData.push({ time: timeSec, value: s.data.lower[idx] as number });
              }
            }

            upperSeries.setData(upperData);
            midSeries.setData(midData);
            lowerSeries.setData(lowerData);

            overlaySeriesMapRef.current.set(`${cfg.id}-upper`, upperSeries);
            overlaySeriesMapRef.current.set(`${cfg.id}-mid`, midSeries);
            overlaySeriesMapRef.current.set(`${cfg.id}-lower`, lowerSeries);
          } else {
            // Standard single line overlay (SMA, EMA, VWAP)
            const lineSeries = mainChartRef.current.addLineSeries({
              color: cfg.style.color || '#3B82F6',
              lineWidth: (cfg.style.lineWidth || 2) as any,
              title: cfg.id.toUpperCase(),
            });

            const lineData: LineData[] = [];
            for (let idx = 0; idx < s.timestamps.length; idx++) {
              const val = s.data.values?.[idx];
              if (val !== null && val !== undefined) {
                const timeSec = Math.floor(new Date(s.timestamps[idx]).getTime() / 1000) as Time;
                lineData.push({ time: timeSec, value: val });
              }
            }

            lineSeries.setData(lineData);
            overlaySeriesMapRef.current.set(cfg.id, lineSeries);
          }
        }
      } catch (err) {
        console.error('Failed to calculate overlays', err);
      }
    }

    calculateOverlays();
    return () => {
      isMounted = false;
    };
  }, [candles, indicators, symbol, interval]);

  // Render RSI Sub-Chart if active
  const rsiActive = indicators.some((i) => i.id.startsWith('rsi') && i.enabled);
  useEffect(() => {
    if (!rsiActive || !rsiContainerRef.current) {
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
      }
      return;
    }

    const container = rsiContainerRef.current;
    if (rsiChartRef.current) {
      rsiChartRef.current.remove();
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 120,
      layout: {
        background: { type: ColorType.Solid, color: '#0B0F19' },
        textColor: '#94A3B8',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.4)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.4)' },
      },
      timeScale: {
        visible: true,
        borderColor: '#1E293B',
      },
      rightPriceScale: {
        borderColor: '#1E293B',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
    });

    const rsiSeries = chart.addLineSeries({
      color: '#EC4899',
      lineWidth: 2,
    });

    // 70 & 30 Reference lines
    rsiSeries.createPriceLine({
      price: 70,
      color: 'rgba(239, 68, 68, 0.6)',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: '70 (Overbought)',
    });

    rsiSeries.createPriceLine({
      price: 30,
      color: 'rgba(16, 185, 129, 0.6)',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: '30 (Oversold)',
    });

    rsiChartRef.current = chart;
    rsiSeriesRef.current = rsiSeries;

    // Fetch and populate RSI series data
    const rsiConfig = indicators.find((i) => i.id.startsWith('rsi') && i.enabled);
    if (rsiConfig && candles.length > 0) {
      chartingApiService
        .calculateIndicators(symbol, interval, [rsiConfig])
        .then((res) => {
          if (res.series[0]?.data.values) {
            const data: LineData[] = [];
            for (let i = 0; i < res.series[0].timestamps.length; i++) {
              const val = res.series[0].data.values[i];
              if (val !== null && val !== undefined) {
                data.push({
                  time: Math.floor(new Date(res.series[0].timestamps[i]).getTime() / 1000) as Time,
                  value: val,
                });
              }
            }
            rsiSeries.setData(data);
            chart.timeScale().fitContent();
          }
        })
        .catch((err) => console.error('Error fetching RSI data', err));
    }

    return () => {
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
      }
    };
  }, [rsiActive, symbol, interval, candles.length]);

  // Real-time market feed subscription
  useEffect(() => {
    const marketChannel = `market:${symbol.toUpperCase()}`;
    socketService.subscribe(marketChannel);

    const handlePriceUpdate = (event: any) => {
      if (!mainPriceSeriesRef.current || !event) return;
      const nowSec = Math.floor(Date.now() / 1000) as Time;
      const price = parseFloat(event.price || event.lastPrice || '0');
      if (price <= 0) return;

      if (chartType === 'LINE' || chartType === 'AREA') {
        mainPriceSeriesRef.current.update({
          time: nowSec,
          value: price,
        });
      } else {
        const high = event.high ? parseFloat(event.high) : price;
        const low = event.low ? parseFloat(event.low) : price;
        const open = event.open ? parseFloat(event.open) : price;

        mainPriceSeriesRef.current.update({
          time: nowSec,
          open,
          high,
          low,
          close: price,
        });
      }
    };

    socketService.on('market:price_update', handlePriceUpdate);

    return () => {
      socketService.unsubscribe(marketChannel);
      socketService.off('market:price_update', handlePriceUpdate);
    };
  }, [symbol, chartType]);

  // Save Workspace Preference
  const handleSavePreferences = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await chartingApiService.savePreferences({
        symbol,
        interval,
        chartType,
        indicatorsConfig: indicators,
        volumeProfileConfig,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save chart preferences', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset Workspace Preference
  const handleResetPreferences = async () => {
    try {
      await chartingApiService.resetPreferences(symbol);
      const def = await chartingApiService.getPreferences(symbol);
      setIntervalState((def.interval as CandleInterval) || '1d');
      setChartType(def.chartType);
      setIndicators(def.indicatorsConfig);
      setVolumeProfileConfig(def.volumeProfileConfig);
    } catch (err) {
      console.error('Failed to reset chart preferences', err);
    }
  };

  // Toggle Indicator active state
  const toggleIndicator = (id: string) => {
    setIndicators((prev) =>
      prev.map((ind) => (ind.id === id ? { ...ind, enabled: !ind.enabled } : ind))
    );
  };

  return (
    <div className="flex flex-col bg-[#0B0F19] border border-card-border rounded-xl overflow-hidden shadow-2xl relative">
      {/* Header Toolbar */}
      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between p-3 bg-[#0D1322] border-b border-card-border gap-2 text-xs">
          {/* Symbol & Timeframe Selectors */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-base text-white tracking-wide">{symbol}</span>

            {/* Timeframe Buttons */}
            <div className="flex items-center bg-[#131B2E] p-0.5 rounded-lg border border-card-border">
              {(['1m', '5m', '15m', '1h', '1d'] as CandleInterval[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setIntervalState(tf)}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    interval === tf
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Chart Type Selector */}
            <div className="flex items-center bg-[#131B2E] p-0.5 rounded-lg border border-card-border">
              {(['CANDLESTICK', 'LINE', 'AREA'] as ChartType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    chartType === type
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {type === 'CANDLESTICK' ? 'Candles' : type === 'LINE' ? 'Line' : 'Area'}
                </button>
              ))}
            </div>
          </div>

          {/* Indicators, Volume Profile & Workspace Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Quick Overlays Pills */}
            <div className="hidden md:flex items-center gap-1">
              {indicators
                .filter((i) => i.panel === 'OVERLAY')
                .slice(0, 4)
                .map((ind) => (
                  <button
                    key={ind.id}
                    onClick={() => toggleIndicator(ind.id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                      ind.enabled
                        ? 'bg-blue-900/40 text-blue-400 border-blue-700'
                        : 'bg-[#131B2E] text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {ind.type} {ind.params.period ? `(${ind.params.period})` : ''}
                  </button>
                ))}

              {/* Volume Profile Quick Toggle */}
              <button
                onClick={() =>
                  setVolumeProfileConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
                }
                className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                  volumeProfileConfig.enabled
                    ? 'bg-amber-900/40 text-amber-400 border-amber-700'
                    : 'bg-[#131B2E] text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                Vol Profile
              </button>
            </div>

            {/* Studio Settings Dialog Button */}
            <button
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className="p-1.5 rounded-lg bg-[#131B2E] hover:bg-slate-800 text-slate-300 border border-card-border transition-colors flex items-center gap-1.5"
              title="Indicator & Chart Configuration"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Indicators</span>
            </button>

            {/* Save Workspace Button */}
            <button
              onClick={handleSavePreferences}
              disabled={isSaving}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                saveSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50'
              }`}
            >
              {saveSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Workspace</span>
                </>
              )}
            </button>

            {/* Reset Button */}
            <button
              onClick={handleResetPreferences}
              className="p-1.5 rounded-lg bg-[#131B2E] hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-card-border transition-colors"
              title="Reset Workspace to Defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Chart Canvas Area with Relative Positioning for Volume Profile Overlay */}
      <div className="relative w-full overflow-hidden flex-1">
        {isLoading && (
          <div className="absolute inset-0 bg-[#0B0F19]/80 backdrop-blur-sm flex items-center justify-center z-20">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-slate-400">Loading high-resolution market data...</span>
            </div>
          </div>
        )}

        {/* Lightweight Charts Main Canvas */}
        <div ref={mainContainerRef} className="w-full" />

        {/* Derived Volume Profile Overlay along Price Axis */}
        {volumeProfileConfig.enabled && volumeProfileData && volumeProfileData.bins.length > 0 && (
          <div className="absolute top-2 left-2 pointer-events-none z-10 bg-[#0D1322]/90 border border-card-border p-2.5 rounded-lg shadow-xl backdrop-blur-md max-w-xs">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Estimated Volume Profile</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {formatNumber(volumeProfileData.totalVolume)} shares
              </span>
            </div>

            {/* POC and Value Area Key Stats */}
            <div className="grid grid-cols-3 gap-2 py-1 text-[10px] border-t border-b border-card-border/60 mb-2">
              <div>
                <span className="text-slate-500 block">POC Price</span>
                <span className="font-bold text-amber-400 font-mono">
                  {formatCurrency(volumeProfileData.pocPrice)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">VAH (High)</span>
                <span className="font-semibold text-blue-400 font-mono">
                  {formatCurrency(volumeProfileData.vahPrice)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">VAL (Low)</span>
                <span className="font-semibold text-blue-400 font-mono">
                  {formatCurrency(volumeProfileData.valPrice)}
                </span>
              </div>
            </div>

            {/* Horizontal Volume Profile Bins Mini-Histogram */}
            <div className="flex flex-col-reverse gap-0.5 max-h-36 overflow-y-auto pr-1">
              {volumeProfileData.bins.map((bin, idx) => {
                const isPoc = Math.abs(bin.midPrice - volumeProfileData.pocPrice) < 0.01;
                return (
                  <div key={idx} className="flex items-center gap-1.5 text-[9px] font-mono">
                    <span className="text-slate-400 w-12 text-right truncate">
                      {bin.midPrice.toFixed(1)}
                    </span>
                    <div className="flex-1 bg-slate-800/80 rounded-sm h-2.5 overflow-hidden flex">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isPoc
                            ? 'bg-amber-400 shadow-sm shadow-amber-400/50'
                            : bin.isInValueArea
                            ? 'bg-blue-500/70'
                            : 'bg-slate-600/40'
                        }`}
                        style={{ width: `${Math.max(2, bin.percentage)}%` }}
                      />
                    </div>
                    <span className="text-slate-500 w-7 text-right">
                      {bin.percentage.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Transparency Disclaimer */}
            <div className="mt-2 pt-1 border-t border-card-border/60 flex items-start gap-1 text-[9px] text-slate-500 leading-tight">
              <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
              <span>{volumeProfileData.disclaimer}</span>
            </div>
          </div>
        )}
      </div>

      {/* Sub-Chart Oscillator Panels */}
      {rsiActive && (
        <div className="border-t border-card-border bg-[#0B0F19] relative">
          <div className="absolute top-1.5 left-3 text-[10px] font-semibold text-pink-400 z-10">
            RSI (14) — Relative Strength Index
          </div>
          <div ref={rsiContainerRef} className="w-full" />
        </div>
      )}

      {/* Indicators & Volume Profile Configuration Modal */}
      {isConfigOpen && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-card-border rounded-xl w-full max-w-lg p-5 shadow-2xl text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-sm text-white">Chart Workspace Configuration</h3>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-4 mt-3 border-b border-card-border text-xs">
              <button
                onClick={() => setActiveTab('indicators')}
                className={`pb-2 font-semibold transition-colors border-b-2 ${
                  activeTab === 'indicators'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Technical Indicators
              </button>
              <button
                onClick={() => setActiveTab('volumeProfile')}
                className={`pb-2 font-semibold transition-colors border-b-2 ${
                  activeTab === 'volumeProfile'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Estimated Volume Profile
              </button>
            </div>

            {/* Tab 1: Indicators Checklist */}
            {activeTab === 'indicators' && (
              <div className="py-3 space-y-2 max-h-72 overflow-y-auto">
                {indicators.map((ind) => (
                  <div
                    key={ind.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-[#1E293B]/50 border border-card-border text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={ind.enabled}
                        onChange={() => toggleIndicator(ind.id)}
                        className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <span className="font-medium text-white block">
                          {ind.type} {ind.params.period ? `(${ind.params.period})` : ''}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Panel: {ind.panel} • Color:{' '}
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full ml-1"
                            style={{ backgroundColor: ind.style.color || '#3B82F6' }}
                          />
                        </span>
                      </div>
                    </div>

                    {ind.params.period !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">Period:</span>
                        <input
                          type="number"
                          value={ind.params.period}
                          min={2}
                          max={200}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (val > 0) {
                              setIndicators((prev) =>
                                prev.map((item) =>
                                  item.id === ind.id
                                    ? { ...item, params: { ...item.params, period: val } }
                                    : item
                                )
                              );
                            }
                          }}
                          className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-xs text-white"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Tab 2: Volume Profile Settings */}
            {activeTab === 'volumeProfile' && (
              <div className="py-3 space-y-4 text-xs">
                <div className="flex items-center justify-between p-3 rounded-lg bg-[#1E293B]/50 border border-card-border">
                  <div>
                    <span className="font-semibold text-white block">Enable Volume Profile</span>
                    <span className="text-[11px] text-slate-400">
                      Renders volume nodes, Point of Control (POC), and Value Area High/Low.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={volumeProfileConfig.enabled}
                    onChange={(e) =>
                      setVolumeProfileConfig((prev) => ({ ...prev, enabled: e.target.checked }))
                    }
                    className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#1E293B]/40 p-3 rounded-lg border border-card-border">
                    <label className="text-[11px] font-medium text-slate-300 block mb-1">
                      Price Bins Count
                    </label>
                    <select
                      value={volumeProfileConfig.binsCount}
                      onChange={(e) =>
                        setVolumeProfileConfig((prev) => ({
                          ...prev,
                          binsCount: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                    >
                      <option value={12}>12 Bins (Coarse)</option>
                      <option value={24}>24 Bins (Standard)</option>
                      <option value={36}>36 Bins (Fine)</option>
                      <option value={48}>48 Bins (High Definition)</option>
                    </select>
                  </div>

                  <div className="bg-[#1E293B]/40 p-3 rounded-lg border border-card-border">
                    <label className="text-[11px] font-medium text-slate-300 block mb-1">
                      Value Area Coverage (%)
                    </label>
                    <select
                      value={volumeProfileConfig.valueAreaPercent}
                      onChange={(e) =>
                        setVolumeProfileConfig((prev) => ({
                          ...prev,
                          valueAreaPercent: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                    >
                      <option value={68}>68% (1 Standard Deviation)</option>
                      <option value={70}>70% (Industry Standard)</option>
                      <option value={80}>80% (Broad Range)</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-900/50 flex items-start gap-2 text-[11px] text-blue-300">
                  <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    Volume Profile distributes bar volume across overlapping price bins from
                    OHLCV candles. Point of Control (POC) highlights the highest volume bin.
                  </span>
                </div>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-card-border flex justify-end gap-2">
              <button
                onClick={() => setIsConfigOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                Apply & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
