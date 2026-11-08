/**
 * Indian Equity Market Symbol & Instrument Mapper
 *
 * Handles symbol conversions across NSE and BSE conventions,
 * segment classifications, lot sizes, tick sizes, and price rounding.
 */

export interface IndianInstrumentMetadata {
  symbol: string;
  nseSymbol: string;
  bseCode: string;
  name: string;
  sector: string;
  series: string; // 'EQ', 'BE', 'BZ'
  lotSize: number;
  tickSize: number; // default 0.05
  pricePrecision: number;
  upperCircuitLimitPercent: number; // default 10%
  lowerCircuitLimitPercent: number; // default 10%
  isin: string;
}

// Master reference mapping for major Indian equities
export const INDIAN_EQUITIES_MASTER: Record<string, IndianInstrumentMetadata> = {
  RELIANCE: {
    symbol: 'RELIANCE',
    nseSymbol: 'NSE:RELIANCE-EQ',
    bseCode: 'BSE:500325',
    name: 'Reliance Industries Ltd',
    sector: 'Oil & Gas / Conglomerate',
    series: 'EQ',
    lotSize: 1,
    tickSize: 0.05,
    pricePrecision: 2,
    upperCircuitLimitPercent: 10,
    lowerCircuitLimitPercent: 10,
    isin: 'INE002A01018',
  },
  TCS: {
    symbol: 'TCS',
    nseSymbol: 'NSE:TCS-EQ',
    bseCode: 'BSE:532540',
    name: 'Tata Consultancy Services Ltd',
    sector: 'Information Technology',
    series: 'EQ',
    lotSize: 1,
    tickSize: 0.05,
    pricePrecision: 2,
    upperCircuitLimitPercent: 10,
    lowerCircuitLimitPercent: 10,
    isin: 'INE467B01029',
  },
  INFY: {
    symbol: 'INFY',
    nseSymbol: 'NSE:INFY-EQ',
    bseCode: 'BSE:500209',
    name: 'Infosys Ltd',
    sector: 'Information Technology',
    series: 'EQ',
    lotSize: 1,
    tickSize: 0.05,
    pricePrecision: 2,
    upperCircuitLimitPercent: 10,
    lowerCircuitLimitPercent: 10,
    isin: 'INE009A01021',
  },
  HDFCBANK: {
    symbol: 'HDFCBANK',
    nseSymbol: 'NSE:HDFCBANK-EQ',
    bseCode: 'BSE:500180',
    name: 'HDFC Bank Ltd',
    sector: 'Banking & Financial Services',
    series: 'EQ',
    lotSize: 1,
    tickSize: 0.05,
    pricePrecision: 2,
    upperCircuitLimitPercent: 10,
    lowerCircuitLimitPercent: 10,
    isin: 'INE040A01034',
  },
  ICICIBANK: {
    symbol: 'ICICIBANK',
    nseSymbol: 'NSE:ICICIBANK-EQ',
    bseCode: 'BSE:532174',
    name: 'ICICI Bank Ltd',
    sector: 'Banking & Financial Services',
    series: 'EQ',
    lotSize: 1,
    tickSize: 0.05,
    pricePrecision: 2,
    upperCircuitLimitPercent: 10,
    lowerCircuitLimitPercent: 10,
    isin: 'INE090A01021',
  },
  SBIN: {
    symbol: 'SBIN',
    nseSymbol: 'NSE:SBIN-EQ',
    bseCode: 'BSE:500112',
    name: 'State Bank of India',
    sector: 'Banking & Financial Services',
    series: 'EQ',
    lotSize: 1,
    tickSize: 0.05,
    pricePrecision: 2,
    upperCircuitLimitPercent: 10,
    lowerCircuitLimitPercent: 10,
    isin: 'INE062A01020',
  },
  TATAMOTORS: {
    symbol: 'TATAMOTORS',
    nseSymbol: 'NSE:TATAMOTORS-EQ',
    bseCode: 'BSE:500570',
    name: 'Tata Motors Ltd',
    sector: 'Automotive',
    series: 'EQ',
    lotSize: 1,
    tickSize: 0.05,
    pricePrecision: 2,
    upperCircuitLimitPercent: 10,
    lowerCircuitLimitPercent: 10,
    isin: 'INE155A01022',
  },
};

export class IndianSymbolMapper {
  /**
   * Parses any input representation (e.g. 'RELIANCE', 'NSE:RELIANCE-EQ', 'BSE:500325', 'RELIANCE.NS')
   * into canonical base symbol, exchange, and segment series.
   */
  static parseSymbol(input: string): {
    baseSymbol: string;
    exchange: 'NSE' | 'BSE' | 'TRADEGRID';
    series?: string;
    rawInput: string;
  } {
    const raw = input.trim().toUpperCase();

    // Check BSE Security code match
    for (const [key, meta] of Object.entries(INDIAN_EQUITIES_MASTER)) {
      if (raw === meta.bseCode || raw === meta.bseCode.replace('BSE:', '')) {
        return { baseSymbol: key, exchange: 'BSE', series: 'EQ', rawInput: input };
      }
    }

    let exchange: 'NSE' | 'BSE' | 'TRADEGRID' = 'NSE';
    let clean = raw;

    if (clean.startsWith('NSE:')) {
      exchange = 'NSE';
      clean = clean.replace('NSE:', '');
    } else if (clean.startsWith('BSE:')) {
      exchange = 'BSE';
      clean = clean.replace('BSE:', '');
    } else if (clean.startsWith('TRADEGRID:')) {
      exchange = 'TRADEGRID';
      clean = clean.replace('TRADEGRID:', '');
    } else if (clean.endsWith('.NS')) {
      exchange = 'NSE';
      clean = clean.replace('.NS', '');
    } else if (clean.endsWith('.BO')) {
      exchange = 'BSE';
      clean = clean.replace('.BO', '');
    }

    let series = 'EQ';
    if (clean.endsWith('-EQ')) {
      series = 'EQ';
      clean = clean.replace('-EQ', '');
    } else if (clean.endsWith('-BE')) {
      series = 'BE';
      clean = clean.replace('-BE', '');
    }

    return {
      baseSymbol: clean,
      exchange,
      series,
      rawInput: input,
    };
  }

  /**
   * Formats a symbol into exchange-specific standardized format.
   */
  static toExchangeSymbol(symbol: string, targetExchange: 'NSE' | 'BSE' = 'NSE'): string {
    const parsed = this.parseSymbol(symbol);
    const meta = INDIAN_EQUITIES_MASTER[parsed.baseSymbol];

    if (targetExchange === 'BSE') {
      return meta ? meta.bseCode : `BSE:${parsed.baseSymbol}`;
    }

    return meta ? meta.nseSymbol : `NSE:${parsed.baseSymbol}-EQ`;
  }

  /**
   * Retrieves instrument metadata with lot size, tick size, and circuit parameters.
   */
  static getMetadata(symbol: string): IndianInstrumentMetadata {
    const parsed = this.parseSymbol(symbol);
    const meta = INDIAN_EQUITIES_MASTER[parsed.baseSymbol];

    if (meta) {
      return meta;
    }

    // Default metadata for unlisted / dynamic Indian equities
    return {
      symbol: parsed.baseSymbol,
      nseSymbol: `NSE:${parsed.baseSymbol}-EQ`,
      bseCode: `BSE:${parsed.baseSymbol}`,
      name: parsed.baseSymbol,
      sector: 'General Indian Equity',
      series: parsed.series || 'EQ',
      lotSize: 1,
      tickSize: 0.05,
      pricePrecision: 2,
      upperCircuitLimitPercent: 10,
      lowerCircuitLimitPercent: 10,
      isin: 'INE999A99999',
    };
  }

  /**
   * Rounds a price to the nearest valid exchange tick size (default ₹0.05).
   * E.g. 2500.03 -> 2500.05; 2500.01 -> 2500.00.
   */
  static roundToTick(price: number | string, tickSize: number = 0.05): string {
    const num = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(num) || num <= 0) return '0.0000';

    const rounded = Math.round(num / tickSize) * tickSize;
    return rounded.toFixed(4);
  }

  /**
   * Validates if an order quantity is a positive multiple of the exchange lot size.
   */
  static isValidLotQuantity(quantity: number, lotSize: number = 1): boolean {
    return quantity > 0 && Number.isInteger(quantity) && quantity % lotSize === 0;
  }
}
