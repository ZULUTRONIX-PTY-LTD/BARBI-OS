import type { FinTechRailStatus } from './moduleCatalog';

export type VentureAssetKey = 'easyequities' | 'crypto' | 'cash';
export type DisplayCurrency = 'ZAR' | 'USD';

export const DEFAULT_USD_TO_ZAR_RATE = 18.25;

export interface VentureAllocationSlice {
  key: VentureAssetKey;
  label: string;
  subtitle: string;
  color: string;
  accentBgClass: string;
  accentTextClass: string;
  valueZar: number;
  valueUsd: number;
  displayValue: number;
  percentage: number;
  railIds: string[];
  moduleCodes: string[];
  hasLiveArmed: boolean;
  returnSummary: string;
}

export interface VentureAllocationSummary {
  displayCurrency: DisplayCurrency;
  usdToZarRate: number;
  totalZar: number;
  totalUsd: number;
  totalDisplayValue: number;
  slices: VentureAllocationSlice[];
}

/**
 * Extracts a numeric paper/sandbox balance and native currency from a FinTech rail label
 * such as "R 125,000.00 (Paper)", "$ 5,000.00 (Dry-Run)", or "$ 10,000.00 (Demo)".
 */
export function parseRailPaperAmount(
  paperBalanceLabel: string,
  railCurrency: FinTechRailStatus['currency']
): { amount: number; currency: DisplayCurrency } | null {
  const trimmed = (paperBalanceLabel || '').trim();
  const match = trimmed.match(/([R$])?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (!match) return null;

  const rawNum = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(rawNum) || rawNum < 0) return null;

  const symbol = match[1];
  let currency: DisplayCurrency;
  if (symbol === 'R') {
    currency = 'ZAR';
  } else if (symbol === '$') {
    currency = 'USD';
  } else {
    currency = railCurrency === 'ZAR' ? 'ZAR' : 'USD';
  }

  return { amount: rawNum, currency };
}

export function classifyRailAssetBucket(rail: FinTechRailStatus): VentureAssetKey | null {
  if (rail.id === 'ee-portfolio' || rail.category === 'EQUITIES') {
    return 'easyequities';
  }
  if (rail.id === 'freqtrade-crypto' || rail.category === 'CRYPTO') {
    return 'crypto';
  }
  if (
    rail.category === 'FOREX' ||
    rail.category === 'PAYMENTS' ||
    rail.category === 'ACCOUNTING'
  ) {
    return 'cash';
  }
  return null;
}

export function formatVentureCurrency(amount: number, currency: DisplayCurrency): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(safe));
  return currency === 'ZAR' ? `R ${formatted}` : `$ ${formatted}`;
}

export function computeVentureAllocation(
  rails: ReadonlyArray<FinTechRailStatus>,
  options?: {
    displayCurrency?: DisplayCurrency;
    usdToZarRate?: number;
  }
): VentureAllocationSummary {
  const displayCurrency: DisplayCurrency = options?.displayCurrency ?? 'ZAR';
  const usdToZarRate =
    options?.usdToZarRate && options.usdToZarRate > 0
      ? options.usdToZarRate
      : DEFAULT_USD_TO_ZAR_RATE;

  const bucketDefs: Record<
    VentureAssetKey,
    {
      label: string;
      subtitle: string;
      color: string;
      accentBgClass: string;
      accentTextClass: string;
    }
  > = {
    easyequities: {
      label: 'EasyEquities',
      subtitle: 'ZAR / USD / TFSA Equities & Satrix',
      color: '#f59e0b',
      accentBgClass: 'bg-amber-400',
      accentTextClass: 'text-amber-300',
    },
    crypto: {
      label: 'Crypto',
      subtitle: 'Freqtrade FreqAI & Hummingbot',
      color: '#38bdf8',
      accentBgClass: 'bg-sky-400',
      accentTextClass: 'text-sky-300',
    },
    cash: {
      label: 'Cash',
      subtitle: 'FX Liquidity, PayPal Treasury & Ledger',
      color: '#10b981',
      accentBgClass: 'bg-emerald-400',
      accentTextClass: 'text-emerald-300',
    },
  };

  const accum: Record<
    VentureAssetKey,
    {
      zar: number;
      usd: number;
      railIds: string[];
      moduleCodes: string[];
      hasLiveArmed: boolean;
      returnNotes: string[];
    }
  > = {
    easyequities: { zar: 0, usd: 0, railIds: [], moduleCodes: [], hasLiveArmed: false, returnNotes: [] },
    crypto: { zar: 0, usd: 0, railIds: [], moduleCodes: [], hasLiveArmed: false, returnNotes: [] },
    cash: { zar: 0, usd: 0, railIds: [], moduleCodes: [], hasLiveArmed: false, returnNotes: [] },
  };

  for (const rail of rails) {
    const key = classifyRailAssetBucket(rail);
    if (!key) continue;

    const bucket = accum[key];
    bucket.railIds.push(rail.id);
    const code = `M${rail.moduleId}`;
    if (!bucket.moduleCodes.includes(code)) {
      bucket.moduleCodes.push(code);
    }
    if (!rail.sandboxMode) {
      bucket.hasLiveArmed = true;
    }

    const parsed = parseRailPaperAmount(rail.paperBalanceLabel, rail.currency);
    if (parsed && parsed.amount > 0) {
      if (parsed.currency === 'ZAR') {
        bucket.zar += parsed.amount;
        bucket.usd += parsed.amount / usdToZarRate;
      } else {
        bucket.usd += parsed.amount;
        bucket.zar += parsed.amount * usdToZarRate;
      }
      if (rail.paperReturnLabel) {
        bucket.returnNotes.push(rail.paperReturnLabel);
      }
    }
  }

  const orderedKeys: VentureAssetKey[] = ['easyequities', 'crypto', 'cash'];
  const totalZar = orderedKeys.reduce((sum, key) => sum + accum[key].zar, 0);
  const totalUsd = orderedKeys.reduce((sum, key) => sum + accum[key].usd, 0);
  const totalDisplayValue = displayCurrency === 'ZAR' ? totalZar : totalUsd;

  const slices: VentureAllocationSlice[] = orderedKeys.map((key) => {
    const def = bucketDefs[key];
    const data = accum[key];
    const displayValue = displayCurrency === 'ZAR' ? data.zar : data.usd;
    const percentage = totalZar > 0 ? (data.zar / totalZar) * 100 : 0;

    return {
      key,
      label: def.label,
      subtitle: def.subtitle,
      color: def.color,
      accentBgClass: def.accentBgClass,
      accentTextClass: def.accentTextClass,
      valueZar: Math.round(data.zar * 100) / 100,
      valueUsd: Math.round(data.usd * 100) / 100,
      displayValue: Math.round(displayValue * 100) / 100,
      percentage: Math.round(percentage * 10) / 10,
      railIds: data.railIds,
      moduleCodes: data.moduleCodes,
      hasLiveArmed: data.hasLiveArmed,
      returnSummary: data.returnNotes[0] || 'Paper Sandbox',
    };
  });

  return {
    displayCurrency,
    usdToZarRate,
    totalZar: Math.round(totalZar * 100) / 100,
    totalUsd: Math.round(totalUsd * 100) / 100,
    totalDisplayValue: Math.round(totalDisplayValue * 100) / 100,
    slices,
  };
}
