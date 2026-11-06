import { Knex } from 'knex';

/**
 * Seed 002: Seed Stock Instruments, Initial Quotes, and Consistent OHLCV Candles
 *
 * Requirements:
 * - Small set of real-market NSE instruments (labelled REAL, with static reference catalog source, no invented fake live trades).
 * - 12 fictional TRADEGRID companies (labelled SIMULATED, with realistic simulated quotes and consistent OHLCV candles).
 * - All OHLCV candles satisfy: high >= max(open, close) and low <= min(open, close).
 */
export async function seed(knex: Knex): Promise<void> {
  // Clear existing market tables in reverse dependency order
  await knex('market_candles').del();
  await knex('market_quotes').del();
  await knex('instruments').del();

  const now = new Date();

  // 1. Define Instruments
  const realInstruments = [
    {
      id: 1,
      symbol: 'RELIANCE',
      name: 'Reliance Industries Limited',
      exchange: 'NSE',
      sector: 'Energy',
      instrument_type: 'EQUITY',
      currency: 'INR',
      market_status: 'ACTIVE',
      data_classification: 'REAL',
    },
    {
      id: 2,
      symbol: 'TCS',
      name: 'Tata Consultancy Services Limited',
      exchange: 'NSE',
      sector: 'Technology',
      instrument_type: 'EQUITY',
      currency: 'INR',
      market_status: 'ACTIVE',
      data_classification: 'REAL',
    },
    {
      id: 3,
      symbol: 'INFY',
      name: 'Infosys Limited',
      exchange: 'NSE',
      sector: 'Technology',
      instrument_type: 'EQUITY',
      currency: 'INR',
      market_status: 'ACTIVE',
      data_classification: 'REAL',
    },
    {
      id: 4,
      symbol: 'HDFCBANK',
      name: 'HDFC Bank Limited',
      exchange: 'NSE',
      sector: 'Financial Services',
      instrument_type: 'EQUITY',
      currency: 'INR',
      market_status: 'ACTIVE',
      data_classification: 'REAL',
    },
    {
      id: 5,
      symbol: 'ICICIBANK',
      name: 'ICICI Bank Limited',
      exchange: 'NSE',
      sector: 'Financial Services',
      instrument_type: 'EQUITY',
      currency: 'INR',
      market_status: 'ACTIVE',
      data_classification: 'REAL',
    },
  ];

  const simulatedInstruments = [
    {
      id: 6,
      symbol: 'TGRID',
      name: 'TradeGrid Technologies Corp',
      exchange: 'TRADEGRID',
      sector: 'Financial Technology',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
      basePrice: 142.5,
      prevClose: 138.2,
      vol: 1254300,
    },
    {
      id: 7,
      symbol: 'NEXUS',
      name: 'Nexus Quantum Systems',
      exchange: 'TRADEGRID',
      sector: 'Semiconductors',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
      basePrice: 310.8,
      prevClose: 298.5,
      vol: 890200,
    },
    {
      id: 8,
      symbol: 'SOLARIS',
      name: 'Solaris Energy Dynamics',
      exchange: 'TRADEGRID',
      sector: 'Clean Energy',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
      basePrice: 88.4,
      prevClose: 92.1,
      vol: 450100,
    },
    {
      id: 9,
      symbol: 'AERO',
      name: 'AeroDynamics Hypersonic',
      exchange: 'TRADEGRID',
      sector: 'Aerospace',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
      basePrice: 215.0,
      prevClose: 210.0,
      vol: 672000,
    },
    {
      id: 10,
      symbol: 'BIOGEN',
      name: 'BioGen Therapeutics',
      exchange: 'TRADEGRID',
      sector: 'Biotechnology',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
      basePrice: 64.2,
      prevClose: 67.8,
      vol: 910400,
    },
    {
      id: 11,
      symbol: 'CYBER',
      name: 'CyberShield Defense Labs',
      exchange: 'TRADEGRID',
      sector: 'Cybersecurity',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
      basePrice: 175.6,
      prevClose: 168.0,
      vol: 520000,
    },
    {
      id: 12,
      symbol: 'VORTEX',
      name: 'Vortex Autonomous Robotics',
      exchange: 'TRADEGRID',
      sector: 'Robotics',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
      basePrice: 124.0,
      prevClose: 129.5,
      vol: 380400,
    },
    {
      id: 13,
      symbol: 'QUANTUM',
      name: 'Quantum Algorithmic Compute',
      exchange: 'TRADEGRID',
      sector: 'Quantum Computing',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
      basePrice: 420.5,
      prevClose: 405.0,
      vol: 740100,
    },
    {
      id: 14,
      symbol: 'TERRA',
      name: 'Terra AgriTech Innovations',
      exchange: 'TRADEGRID',
      sector: 'Agriculture',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
      basePrice: 52.8,
      prevClose: 51.2,
      vol: 210500,
    },
    {
      id: 15,
      symbol: 'NOVA',
      name: 'Nova Space Transport Systems',
      exchange: 'TRADEGRID',
      sector: 'Space Exploration',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
      basePrice: 95.0,
      prevClose: 98.4,
      vol: 630200,
    },
    {
      id: 16,
      symbol: 'PULSE',
      name: 'Pulse Health AI Diagnostics',
      exchange: 'TRADEGRID',
      sector: 'Healthcare AI',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
      basePrice: 112.4,
      prevClose: 110.0,
      vol: 415000,
    },
    {
      id: 17,
      symbol: 'TITAN',
      name: 'Titan Heavy Mining & Minerals',
      exchange: 'TRADEGRID',
      sector: 'Basic Materials',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
      basePrice: 78.5,
      prevClose: 81.0,
      vol: 310800,
    },
  ];

  // Insert all instruments
  const allInstrumentsToInsert = [
    ...realInstruments.map((inst) => ({
      ...inst,
      created_at: now,
      updated_at: now,
    })),
    ...simulatedInstruments.map((inst) => ({
      id: inst.id,
      symbol: inst.symbol,
      name: inst.name,
      exchange: inst.exchange,
      sector: inst.sector,
      instrument_type: inst.instrument_type,
      currency: inst.currency,
      market_status: inst.market_status,
      data_classification: inst.data_classification,
      created_at: now,
      updated_at: now,
    })),
  ];

  await knex('instruments').insert(allInstrumentsToInsert);

  // 2. Insert Quotes
  // A. Real Instruments: Indicative reference catalog values (clearly flagged, no fake tick claims)
  const realQuotes = [
    {
      instrument_id: 1, // RELIANCE
      last_price: '2950.0000',
      previous_close: '2950.0000',
      open_price: '2950.0000',
      high_price: '2950.0000',
      low_price: '2950.0000',
      volume: 0,
      change_amount: '0.0000',
      change_percent: '0.0000',
      data_source: 'NSE_STATIC_REFERENCE_CATALOG',
      data_classification: 'REAL',
      timestamp: now,
      created_at: now,
      updated_at: now,
    },
    {
      instrument_id: 2, // TCS
      last_price: '3850.0000',
      previous_close: '3850.0000',
      open_price: '3850.0000',
      high_price: '3850.0000',
      low_price: '3850.0000',
      volume: 0,
      change_amount: '0.0000',
      change_percent: '0.0000',
      data_source: 'NSE_STATIC_REFERENCE_CATALOG',
      data_classification: 'REAL',
      timestamp: now,
      created_at: now,
      updated_at: now,
    },
    {
      instrument_id: 3, // INFY
      last_price: '1480.0000',
      previous_close: '1480.0000',
      open_price: '1480.0000',
      high_price: '1480.0000',
      low_price: '1480.0000',
      volume: 0,
      change_amount: '0.0000',
      change_percent: '0.0000',
      data_source: 'NSE_STATIC_REFERENCE_CATALOG',
      data_classification: 'REAL',
      timestamp: now,
      created_at: now,
      updated_at: now,
    },
    {
      instrument_id: 4, // HDFCBANK
      last_price: '1620.0000',
      previous_close: '1620.0000',
      open_price: '1620.0000',
      high_price: '1620.0000',
      low_price: '1620.0000',
      volume: 0,
      change_amount: '0.0000',
      change_percent: '0.0000',
      data_source: 'NSE_STATIC_REFERENCE_CATALOG',
      data_classification: 'REAL',
      timestamp: now,
      created_at: now,
      updated_at: now,
    },
    {
      instrument_id: 5, // ICICIBANK
      last_price: '1100.0000',
      previous_close: '1100.0000',
      open_price: '1100.0000',
      high_price: '1100.0000',
      low_price: '1100.0000',
      volume: 0,
      change_amount: '0.0000',
      change_percent: '0.0000',
      data_source: 'NSE_STATIC_REFERENCE_CATALOG',
      data_classification: 'REAL',
      timestamp: now,
      created_at: now,
      updated_at: now,
    },
  ];

  // B. Simulated Instruments: Active dynamic simulation quotes
  const simQuotes = simulatedInstruments.map((inst) => {
    const change = inst.basePrice - inst.prevClose;
    const changePct = (change / inst.prevClose) * 100;
    const openPrice = inst.prevClose + (change * 0.3);
    const highPrice = Math.max(openPrice, inst.basePrice) + Math.abs(change * 0.4);
    const lowPrice = Math.min(openPrice, inst.basePrice) - Math.abs(change * 0.4);

    return {
      instrument_id: inst.id,
      last_price: inst.basePrice.toFixed(4),
      previous_close: inst.prevClose.toFixed(4),
      open_price: openPrice.toFixed(4),
      high_price: highPrice.toFixed(4),
      low_price: lowPrice.toFixed(4),
      volume: inst.vol,
      change_amount: change.toFixed(4),
      change_percent: changePct.toFixed(4),
      data_source: 'TRADEGRID_SIMULATOR',
      data_classification: 'SIMULATED',
      timestamp: now,
      created_at: now,
      updated_at: now,
    };
  });

  await knex('market_quotes').insert([...realQuotes, ...simQuotes]);

  // 3. Generate Historical Candles for Simulated Instruments
  // Creates consistent OHLCV candles (1d, 1h, 15m, 5m, 1m)
  const candlesToInsert: any[] = [];

  for (const inst of simulatedInstruments) {
    let currentClose = inst.prevClose;

    // A. Daily Candles (Last 30 days)
    for (let day = 30; day >= 1; day--) {
      const candleTime = new Date(now.getTime() - day * 24 * 3600 * 1000);
      const seedVal = Math.sin(inst.id * 100 + day);
      const dayDelta = seedVal * (inst.basePrice * 0.02);
      const open = currentClose;
      const close = Math.max(1, open + dayDelta);
      const high = Math.max(open, close) + Math.abs(dayDelta * 0.5) + (inst.basePrice * 0.005);
      const low = Math.max(0.1, Math.min(open, close) - Math.abs(dayDelta * 0.5) - (inst.basePrice * 0.005));
      const vol = Math.floor(inst.vol / 30 + Math.abs(seedVal * 10000));

      currentClose = close;

      candlesToInsert.push({
        instrument_id: inst.id,
        interval: '1d',
        timestamp: candleTime,
        open: open.toFixed(4),
        high: high.toFixed(4),
        low: low.toFixed(4),
        close: close.toFixed(4),
        volume: vol,
        data_classification: 'SIMULATED',
        created_at: now,
      });
    }

    // B. Hourly Candles (Last 24 hours)
    let hourClose = inst.basePrice * 0.98;
    for (let h = 24; h >= 1; h--) {
      const candleTime = new Date(now.getTime() - h * 3600 * 1000);
      const seedVal = Math.cos(inst.id * 50 + h);
      const hourDelta = seedVal * (inst.basePrice * 0.008);
      const open = hourClose;
      const close = Math.max(1, open + hourDelta);
      const high = Math.max(open, close) + Math.abs(hourDelta * 0.3) + 0.1;
      const low = Math.max(0.1, Math.min(open, close) - Math.abs(hourDelta * 0.3) - 0.1);
      const vol = Math.floor((inst.vol / 100) + Math.abs(seedVal * 2000));

      hourClose = close;

      candlesToInsert.push({
        instrument_id: inst.id,
        interval: '1h',
        timestamp: candleTime,
        open: open.toFixed(4),
        high: high.toFixed(4),
        low: low.toFixed(4),
        close: close.toFixed(4),
        volume: vol,
        data_classification: 'SIMULATED',
        created_at: now,
      });
    }

    // C. 15-Minute Candles (Last 6 hours)
    let min15Close = inst.basePrice * 0.99;
    for (let m = 24; m >= 1; m--) {
      const candleTime = new Date(now.getTime() - m * 15 * 60 * 1000);
      const seedVal = Math.sin(inst.id * 30 + m);
      const delta = seedVal * (inst.basePrice * 0.004);
      const open = min15Close;
      const close = Math.max(1, open + delta);
      const high = Math.max(open, close) + Math.abs(delta * 0.2) + 0.05;
      const low = Math.max(0.1, Math.min(open, close) - Math.abs(delta * 0.2) - 0.05);
      const vol = Math.floor((inst.vol / 400) + Math.abs(seedVal * 500));

      min15Close = close;

      candlesToInsert.push({
        instrument_id: inst.id,
        interval: '15m',
        timestamp: candleTime,
        open: open.toFixed(4),
        high: high.toFixed(4),
        low: low.toFixed(4),
        close: close.toFixed(4),
        volume: vol,
        data_classification: 'SIMULATED',
        created_at: now,
      });
    }

    // D. 5-Minute Candles (Last 2 hours)
    let min5Close = inst.basePrice;
    for (let m = 24; m >= 1; m--) {
      const candleTime = new Date(now.getTime() - m * 5 * 60 * 1000);
      const seedVal = Math.cos(inst.id * 20 + m);
      const delta = seedVal * (inst.basePrice * 0.002);
      const open = min5Close;
      const close = Math.max(1, open + delta);
      const high = Math.max(open, close) + Math.abs(delta * 0.2) + 0.02;
      const low = Math.max(0.1, Math.min(open, close) - Math.abs(delta * 0.2) - 0.02);
      const vol = Math.floor((inst.vol / 1200) + Math.abs(seedVal * 200));

      min5Close = close;

      candlesToInsert.push({
        instrument_id: inst.id,
        interval: '5m',
        timestamp: candleTime,
        open: open.toFixed(4),
        high: high.toFixed(4),
        low: low.toFixed(4),
        close: close.toFixed(4),
        volume: vol,
        data_classification: 'SIMULATED',
        created_at: now,
      });
    }

    // E. 1-Minute Candles (Last 30 minutes)
    let min1Close = inst.basePrice;
    for (let m = 30; m >= 1; m--) {
      const candleTime = new Date(now.getTime() - m * 60 * 1000);
      const seedVal = Math.sin(inst.id * 10 + m);
      const delta = seedVal * (inst.basePrice * 0.001);
      const open = min1Close;
      const close = Math.max(1, open + delta);
      const high = Math.max(open, close) + Math.abs(delta * 0.1) + 0.01;
      const low = Math.max(0.1, Math.min(open, close) - Math.abs(delta * 0.1) - 0.01);
      const vol = Math.floor((inst.vol / 6000) + Math.abs(seedVal * 100));

      min1Close = close;

      candlesToInsert.push({
        instrument_id: inst.id,
        interval: '1m',
        timestamp: candleTime,
        open: open.toFixed(4),
        high: high.toFixed(4),
        low: low.toFixed(4),
        close: close.toFixed(4),
        volume: vol,
        data_classification: 'SIMULATED',
        created_at: now,
      });
    }
  }

  // Batch insert candles in chunks of 500 to avoid query size limits
  const chunkSize = 500;
  for (let i = 0; i < candlesToInsert.length; i += chunkSize) {
    const chunk = candlesToInsert.slice(i, i + chunkSize);
    await knex('market_candles').insert(chunk);
  }
}
