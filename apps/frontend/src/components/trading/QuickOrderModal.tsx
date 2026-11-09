import React, { useState, useEffect } from 'react';
import { useOrderStore } from '../../store/orderStore';
import { useWalletStore } from '../../store/walletStore';
import { Instrument, OrderSide, OrderType } from '@tradegrid/shared-types';
import { formatCurrency } from '../../utils/formatters';
import { Button } from '../common/Button';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface QuickOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  instrument: Instrument;
  initialSide?: OrderSide;
  lastPrice: number;
}

export const QuickOrderModal: React.FC<QuickOrderModalProps> = ({
  isOpen,
  onClose,
  instrument,
  initialSide = 'BUY',
  lastPrice,
}) => {
  const { createOrder, isSubmitting, error, successMessage, clearError, clearSuccess } =
    useOrderStore();
  const { balance, fetchWalletSummary } = useWalletStore();

  const [side, setSide] = useState<OrderSide>(initialSide);
  const [orderType, setOrderType] = useState<OrderType>('LIMIT');
  const [quantity, setQuantity] = useState('10');
  const [limitPrice, setLimitPrice] = useState(lastPrice.toFixed(2));

  useEffect(() => {
    setSide(initialSide);
    setLimitPrice(lastPrice.toFixed(2));
    clearError();
    clearSuccess();
  }, [initialSide, lastPrice, clearError, clearSuccess]);

  if (!isOpen) return null;

  const cash = typeof balance === 'number' ? balance : parseFloat(balance || '0') || 100000;
  const executionPrice = orderType === 'MARKET' ? lastPrice : parseFloat(limitPrice) || lastPrice;
  const parsedQty = parseFloat(quantity) || 0;
  const estimatedTotal = parsedQty * executionPrice;
  const isAffordable = side === 'BUY' ? estimatedTotal <= cash : true;

  const handleAllocation = (percent: number) => {
    const p = executionPrice || 100;
    const maxAffordable = (cash * (percent / 100)) / p;
    setQuantity(Math.max(1, Math.floor(maxAffordable)).toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedQty <= 0) return;

    try {
      await createOrder({
        instrumentId: instrument.id,
        side,
        orderType,
        quantity: parsedQty.toFixed(4),
        limitPrice: orderType === 'LIMIT' ? parseFloat(limitPrice).toFixed(4) : null,
      });
      fetchWalletSummary();
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch {
      // Handled by orderStore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none font-sans">
      <div className="w-full max-w-md bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#222222] rounded-3xl shadow-2xl overflow-hidden transition-all">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-100 dark:border-[#1F1F1F]">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-3 h-3 rounded-full ${
                side === 'BUY' ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-neutral-900 dark:text-white">
                  {side} {instrument.symbol}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-[#1A1A1A] text-neutral-600 dark:text-neutral-400 font-mono">
                  {instrument.exchange || 'NSE'}
                </span>
              </div>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Market Price: {formatCurrency(lastPrice)}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#171717] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Side Selector (Buy / Sell) */}
        <div className="p-5 pb-0">
          <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-100 dark:bg-[#141414] rounded-2xl border border-neutral-200 dark:border-[#222222]">
            <button
              type="button"
              onClick={() => setSide('BUY')}
              className={`py-2 rounded-xl text-xs font-bold transition-all ${
                side === 'BUY'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => setSide('SELL')}
              className={`py-2 rounded-xl text-xs font-bold transition-all ${
                side === 'SELL'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              SELL
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Order Type Toggle */}
          <div>
            <label className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block mb-1.5">
              Order Type
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setOrderType('MARKET')}
                className={`py-2 px-3 rounded-xl border text-center transition-colors ${
                  orderType === 'MARKET'
                    ? 'border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-black font-bold'
                    : 'border-neutral-200 dark:border-[#262626] text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
                }`}
              >
                Market Order (Instant)
              </button>
              <button
                type="button"
                onClick={() => setOrderType('LIMIT')}
                className={`py-2 px-3 rounded-xl border text-center transition-colors ${
                  orderType === 'LIMIT'
                    ? 'border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-black font-bold'
                    : 'border-neutral-200 dark:border-[#262626] text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
                }`}
              >
                Limit Order (Specified)
              </button>
            </div>
          </div>

          {/* Quantity & Quick Chips */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Quantity (Shares)
              </label>
              <span className="text-[11px] font-mono text-neutral-400">
                Avail: {formatCurrency(cash)}
              </span>
            </div>
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#262626] rounded-xl text-sm font-mono text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600"
              required
            />
            {/* Quick % Chips */}
            <div className="flex items-center gap-1.5 mt-2">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleAllocation(pct)}
                  className="flex-1 py-1 text-[11px] font-mono rounded-lg border border-neutral-200 dark:border-[#222222] text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1A1A1A] transition-colors"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Limit Price (if LIMIT) */}
          {orderType === 'LIMIT' && (
            <div>
              <label className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider block mb-1.5">
                Limit Price (₹)
              </label>
              <input
                type="number"
                step="0.05"
                min="0.05"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#262626] rounded-xl text-sm font-mono text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600"
                required
              />
            </div>
          )}

          {/* Order Summary & Brokerage Guarantee */}
          <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-[#121212] border border-neutral-200 dark:border-[#222222] space-y-1.5 text-xs font-mono">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
              <span>Estimated Value</span>
              <span className="font-bold text-neutral-900 dark:text-white">
                {formatCurrency(estimatedTotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
              <span>Brokerage & Taxes</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                ₹0.00 (SIMULATOR)
              </span>
            </div>
            {!isAffordable && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-sans font-medium pt-1">
                ⚠️ Insufficient available cash for this order.
              </p>
            )}
          </div>

          {/* Action Button */}
          <Button
            type="submit"
            disabled={!isAffordable || parsedQty <= 0 || isSubmitting}
            isLoading={isSubmitting}
            className={`w-full py-3 text-sm font-bold text-white rounded-xl shadow-md ${
              side === 'BUY'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-rose-600 hover:bg-rose-500'
            }`}
          >
            Place {side} Order • {formatCurrency(estimatedTotal)}
          </Button>
        </form>
      </div>
    </div>
  );
};
