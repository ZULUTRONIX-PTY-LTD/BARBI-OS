import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { FinTechRailStatus } from '../v4/moduleCatalog';
import {
  computeVentureAllocation,
  formatVentureCurrency,
  type DisplayCurrency,
  type VentureAllocationSlice,
  type VentureAssetKey,
} from '../v4/ventureAllocation';

interface VentureAllocationPieChartProps {
  rails: ReadonlyArray<FinTechRailStatus>;
  selectedAsset: VentureAssetKey | null;
  onSelectAsset: (asset: VentureAssetKey | null) => void;
}

const CHART_SIZE = 216;
const OUTER_RADIUS = 90;
const ACTIVE_OUTER_RADIUS = 96;
const INNER_RADIUS = 62;

export function VentureAllocationPieChart({
  rails,
  selectedAsset,
  onSelectAsset,
}: VentureAllocationPieChartProps) {
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('ZAR');
  const [hoveredAsset, setHoveredAsset] = useState<VentureAssetKey | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const prevAnglesRef = useRef<Map<VentureAssetKey, { startAngle: number; endAngle: number }>>(
    new Map()
  );
  const selectedAssetRef = useRef<VentureAssetKey | null>(selectedAsset);
  const onSelectAssetRef = useRef(onSelectAsset);

  selectedAssetRef.current = selectedAsset;
  onSelectAssetRef.current = onSelectAsset;

  const summary = useMemo(
    () => computeVentureAllocation(rails, { displayCurrency }),
    [rails, displayCurrency]
  );

  const activeAssetKey = hoveredAsset ?? selectedAsset;
  const activeSlice = useMemo(
    () => summary.slices.find((s) => s.key === activeAssetKey) ?? null,
    [summary.slices, activeAssetKey]
  );

  const liveCount = useMemo(
    () => summary.slices.filter((s) => s.hasLiveArmed).length,
    [summary.slices]
  );

  // Effect 1: Data-join D3 slices idempotently (never detach existing <path> nodes on hover/click)
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    let rootGroup = svg.select<SVGGElement>('g.venture-pie-root');
    if (rootGroup.empty()) {
      rootGroup = svg
        .append('g')
        .attr('class', 'venture-pie-root')
        .attr('transform', `translate(${CHART_SIZE / 2}, ${CHART_SIZE / 2})`);

      rootGroup
        .append('circle')
        .attr('class', 'venture-pie-track')
        .attr('r', (OUTER_RADIUS + INNER_RADIUS) / 2)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255, 255, 255, 0.06)')
        .attr('stroke-width', OUTER_RADIUS - INNER_RADIUS);
    }

    const nonZeroSlices = summary.slices.filter((s) => s.displayValue > 0);
    const pieGenerator = d3
      .pie<VentureAllocationSlice>()
      .value((d) => d.displayValue)
      .sort(null)
      .padAngle(0.032);

    const arcs = pieGenerator(nonZeroSlices);

    const baseArc = d3
      .arc<d3.PieArcDatum<VentureAllocationSlice>>()
      .innerRadius(INNER_RADIUS)
      .outerRadius(OUTER_RADIUS)
      .cornerRadius(4);

    const paths = rootGroup
      .selectAll<SVGPathElement, d3.PieArcDatum<VentureAllocationSlice>>('path.venture-pie-slice')
      .data(arcs, (d) => d.data.key)
      .join(
        (enter) =>
          enter
            .append('path')
            .attr('class', 'venture-pie-slice')
            .attr('data-asset', (d) => d.data.key)
            .attr('role', 'button')
            .attr('tabindex', 0)
            .attr('stroke', '#0a0705')
            .attr('stroke-width', 1.5)
            .style('cursor', 'pointer')
            .on('mouseenter', (_event, d) => {
              setHoveredAsset(d.data.key);
            })
            .on('mouseleave', () => {
              setHoveredAsset(null);
            })
            .on('focus', (_event, d) => {
              setHoveredAsset(d.data.key);
            })
            .on('blur', () => {
              setHoveredAsset(null);
            })
            .on('click', (_event, d) => {
              const next = selectedAssetRef.current === d.data.key ? null : d.data.key;
              onSelectAssetRef.current(next);
            })
            .on('keydown', (event: KeyboardEvent, d) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const next = selectedAssetRef.current === d.data.key ? null : d.data.key;
                onSelectAssetRef.current(next);
              }
            }),
        (update) => update,
        (exit) => exit.remove()
      );

    paths
      .attr('fill', (d) => d.data.color)
      .attr(
        'aria-label',
        (d) =>
          `${d.data.label}: ${formatVentureCurrency(d.data.displayValue, summary.displayCurrency)} (${d.data.percentage}%)`
      )
      .transition('angles')
      .duration(380)
      .ease(d3.easeCubicOut)
      .attrTween('d', (d) => {
        const prev = prevAnglesRef.current.get(d.data.key) ?? {
          startAngle: d.startAngle,
          endAngle: d.startAngle,
        };
        const interpolate = d3.interpolate(
          { startAngle: prev.startAngle, endAngle: prev.endAngle },
          { startAngle: d.startAngle, endAngle: d.endAngle }
        );
        return (t: number) => {
          const next = interpolate(t);
          return baseArc({ ...d, startAngle: next.startAngle, endAngle: next.endAngle }) || '';
        };
      });

    for (const d of arcs) {
      prevAnglesRef.current.set(d.data.key, {
        startAngle: d.startAngle,
        endAngle: d.endAngle,
      });
    }
  }, [summary]);

  // Effect 2: Smooth hover/selection emphasis without touching DOM node identity
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const baseArc = d3
      .arc<d3.PieArcDatum<VentureAllocationSlice>>()
      .innerRadius(INNER_RADIUS)
      .outerRadius(OUTER_RADIUS)
      .cornerRadius(4);

    const expandedArc = d3
      .arc<d3.PieArcDatum<VentureAllocationSlice>>()
      .innerRadius(INNER_RADIUS - 1)
      .outerRadius(ACTIVE_OUTER_RADIUS)
      .cornerRadius(4);

    d3.select(svgEl)
      .selectAll<SVGPathElement, d3.PieArcDatum<VentureAllocationSlice>>('path.venture-pie-slice')
      .transition('highlight')
      .duration(180)
      .ease(d3.easeCubicOut)
      .style('opacity', (d) => (activeAssetKey && activeAssetKey !== d.data.key ? 0.38 : 0.96))
      .attr('d', (d) => (activeAssetKey === d.data.key ? expandedArc(d) || '' : baseArc(d) || ''));
  }, [activeAssetKey, summary]);

  return (
    <section
      aria-label="Venture Asset Allocation"
      data-testid="venture-allocation-chart"
      className="border border-white/[0.09] rounded-lg bg-black/35 p-4 space-y-3"
    >
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.07]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold text-stone-100">
              Venture Asset Allocation
            </h4>
            <span className="text-stone-600" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-tech text-[11px] text-stone-400 tabular-nums">
              EasyEquities · Crypto · Cash
            </span>
          </div>
          <p className="text-[11px] text-stone-400 mt-0.5">
            Derived live from Tier F FinTech rails (1 USD = R {summary.usdToZarRate.toFixed(2)} reference).
          </p>
        </div>

        {/* Display Currency Segmented Control */}
        <div className="flex items-center gap-2 shrink-0">
          {selectedAsset && (
            <button
              type="button"
              onClick={() => onSelectAsset(null)}
              className="text-[11px] font-mono-tech text-amber-300 hover:text-amber-100 underline underline-offset-2 whitespace-nowrap cursor-pointer"
            >
              Show All Rails
            </button>
          )}
          <div
            role="group"
            aria-label="Allocation display currency"
            className="inline-flex items-center p-0.5 rounded-md bg-black/60 border border-white/[0.1]"
          >
            {(['ZAR', 'USD'] as const).map((curr) => {
              const active = displayCurrency === curr;
              return (
                <button
                  key={curr}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDisplayCurrency(curr)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono-tech whitespace-nowrap cursor-pointer transition-colors ${
                    active
                      ? 'bg-amber-500/24 text-amber-100 border border-amber-400/45'
                      : 'text-stone-400 hover:text-stone-100 border border-transparent'
                  }`}
                >
                  {curr}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Split: D3 Donut Ring + Interactive Breakdown Legend */}
      {summary.totalDisplayValue <= 0 ? (
        <div className="py-8 text-center text-xs text-stone-400">
          No FinTech rail balances available to chart yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[232px_1fr] items-center gap-4 md:gap-6">
          {/* Left: D3 SVG Donut Chart with Center Readout */}
          <div className="relative flex items-center justify-center mx-auto w-[216px] h-[216px] shrink-0">
            <svg
              ref={svgRef}
              width={CHART_SIZE}
              height={CHART_SIZE}
              viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`}
              role="img"
              aria-label={`D3 asset allocation pie chart totaling ${formatVentureCurrency(summary.totalDisplayValue, summary.displayCurrency)}`}
              className="overflow-visible block"
            />

            {/* Center Telemetry Overlay */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-8">
              <span className="font-mono-tech text-[10px] uppercase tracking-wider text-stone-400 truncate max-w-full">
                {activeSlice ? activeSlice.label : 'Total Capital'}
              </span>
              <span
                data-testid="venture-chart-center-value"
                className="mt-0.5 font-mono-tech text-base font-semibold text-white tabular-nums leading-tight"
              >
                {formatVentureCurrency(
                  activeSlice ? activeSlice.displayValue : summary.totalDisplayValue,
                  summary.displayCurrency
                )}
              </span>
              <span
                className={`mt-0.5 font-mono-tech text-[10px] tabular-nums ${
                  activeSlice
                    ? activeSlice.accentTextClass
                    : liveCount > 0
                      ? 'text-amber-300'
                      : 'text-sky-300'
                }`}
              >
                {activeSlice
                  ? `${activeSlice.percentage.toFixed(1)}% · ${activeSlice.hasLiveArmed ? 'Live' : 'Sandbox'}`
                  : liveCount > 0
                    ? `${liveCount} Live Armed`
                    : 'Paper Sandbox'}
              </span>
            </div>
          </div>

          {/* Right: Interactive Asset Allocation Rows */}
          <div className="divide-y divide-white/[0.07] border border-white/[0.07] rounded-md bg-black/25">
            {summary.slices.map((slice) => {
              const isSelected = selectedAsset === slice.key;
              const isHighlighted = activeAssetKey === slice.key;
              return (
                <button
                  key={slice.key}
                  type="button"
                  aria-pressed={isSelected}
                  data-testid={`venture-legend-${slice.key}`}
                  onMouseEnter={() => setHoveredAsset(slice.key)}
                  onMouseLeave={() => setHoveredAsset(null)}
                  onFocus={() => setHoveredAsset(slice.key)}
                  onBlur={() => setHoveredAsset(null)}
                  onClick={() => onSelectAsset(isSelected ? null : slice.key)}
                  className={`w-full text-left px-3.5 py-2.5 transition-colors cursor-pointer space-y-1.5 ${
                    isSelected
                      ? 'bg-amber-500/14'
                      : isHighlighted
                        ? 'bg-white/[0.04]'
                        : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        aria-hidden="true"
                        className={`w-2.5 h-2.5 rounded-sm shrink-0 ${slice.accentBgClass}`}
                      />
                      <span className="text-xs font-semibold text-stone-100 truncate">
                        {slice.label}
                      </span>
                      <span className="hidden sm:inline font-mono-tech text-[10.5px] text-stone-500 shrink-0">
                        {slice.moduleCodes.join(' · ')}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 font-mono-tech text-xs tabular-nums shrink-0">
                      <span className="text-white font-medium">
                        {formatVentureCurrency(slice.displayValue, summary.displayCurrency)}
                      </span>
                      <span className={`w-11 text-right text-[11px] ${slice.accentTextClass}`}>
                        {slice.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Proportional Allocation Bar */}
                  <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(0, Math.min(100, slice.percentage))}%`,
                        backgroundColor: slice.color,
                      }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono-tech text-stone-400">
                    <span className="truncate">{slice.subtitle}</span>
                    <span className="shrink-0">
                      <span className="text-emerald-400">{slice.returnSummary}</span>
                      <span className="mx-1.5 text-stone-600" aria-hidden="true">
                        ·
                      </span>
                      <span className={slice.hasLiveArmed ? 'text-amber-300' : 'text-sky-300'}>
                        {slice.hasLiveArmed ? 'Live Armed' : 'Paper Sandbox'}
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
