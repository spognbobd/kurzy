import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Ticket, TicketStatus } from '../types/betting';
import {
  BETANO_HOME_URL,
  formatCZK,
  formatOdds,
  formatPercent,
} from '../utils/analyticsEngine';

interface BankrollStatsProps {
  tickets: Ticket[];
  initialBankroll: number;
  onSettleTicket: (ticketId: string, status: 'won' | 'lost') => void;
  onDeleteTicket: (ticketId: string) => void;
  onResetDemoHistory: () => void;
  onStartFromScratch: () => void;
  onOpenBetano: (homeTeam: string, awayTeam: string) => void;
}

type StatusFilter = 'all' | TicketStatus;

interface EquityPoint {
  index: number;
  label: string;
  dateStr: string;
  balance: number;
  delta: number;
  status: 'start' | 'won' | 'lost';
}

export const BankrollStats: React.FC<BankrollStatsProps> = ({
  tickets,
  initialBankroll,
  onSettleTicket,
  onDeleteTicket,
  onResetDemoHistory,
  onStartFromScratch,
  onOpenBetano,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const metrics = useMemo(() => {
    const settled = tickets.filter((t) => t.status === 'won' || t.status === 'lost');
    const pending = tickets.filter((t) => t.status === 'pending');
    const won = settled.filter((t) => t.status === 'won');
    const lost = settled.filter((t) => t.status === 'lost');

    const totalStaked = settled.reduce((s, t) => s + t.actualStake, 0);
    const totalProfit = settled.reduce((s, t) => s + t.profit, 0);
    const pendingStake = pending.reduce((s, t) => s + t.actualStake, 0);
    const currentCapital = initialBankroll + totalProfit;
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const winRate = settled.length > 0 ? (won.length / settled.length) * 100 : 0;

    return {
      currentCapital,
      totalProfit,
      totalStaked,
      pendingStake,
      roi,
      winRate,
      wonCount: won.length,
      lostCount: lost.length,
      pendingCount: pending.length,
      settledCount: settled.length,
    };
  }, [tickets, initialBankroll]);

  const equityPoints = useMemo<EquityPoint[]>(() => {
    const settledAsc = [...tickets]
      .filter((t) => t.status === 'won' || t.status === 'lost')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    let running = initialBankroll;
    const pts: EquityPoint[] = [
      {
        index: 0,
        label: 'Počáteční kapitál',
        dateStr: 'Start',
        balance: running,
        delta: 0,
        status: 'start',
      },
    ];

    settledAsc.forEach((t, i) => {
      running += t.profit;
      pts.push({
        index: i + 1,
        label: t.label,
        dateStr: new Date(t.createdAt).toLocaleDateString('cs-CZ', {
          day: '2-digit',
          month: '2-digit',
        }),
        balance: running,
        delta: t.profit,
        status: t.status as 'won' | 'lost',
      });
    });

    return pts;
  }, [tickets, initialBankroll]);

  const filteredTickets = useMemo(() => {
    const sorted = [...tickets].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (statusFilter === 'all') return sorted;
    return sorted.filter((t) => t.status === statusFilter);
  }, [tickets, statusFilter]);

  // Chart SVG dimensions
  const chartW = 760;
  const chartH = 240;
  const padL = 68;
  const padR = 24;
  const padT = 22;
  const padB = 34;

  const balances = equityPoints.map((p) => p.balance);
  const rawMin = Math.min(...balances);
  const rawMax = Math.max(...balances);
  const spread = Math.max(500, rawMax - rawMin);
  const minVal = Math.floor((rawMin - spread * 0.18) / 100) * 100;
  const maxVal = Math.ceil((rawMax + spread * 0.18) / 100) * 100;

  const getX = (idx: number) => {
    if (equityPoints.length <= 1) return padL + (chartW - padL - padR) / 2;
    return padL + (idx / (equityPoints.length - 1)) * (chartW - padL - padR);
  };

  const getY = (val: number) => {
    const ratio = (val - minVal) / Math.max(1, maxVal - minVal);
    return chartH - padB - ratio * (chartH - padT - padB);
  };

  const linePath = equityPoints
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(p.balance).toFixed(1)}`)
    .join(' ');

  const areaPath =
    equityPoints.length > 0
      ? `${linePath} L ${getX(equityPoints.length - 1).toFixed(1)} ${(chartH - padB).toFixed(
          1
        )} L ${getX(0).toFixed(1)} ${(chartH - padB).toFixed(1)} Z`
      : '';

  const activePoint =
    hoveredIdx !== null && equityPoints[hoveredIdx]
      ? equityPoints[hoveredIdx]
      : equityPoints[equityPoints.length - 1];

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(minVal + (maxVal - minVal) * t));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-slate-400">
            Sledování vývoje kapitálu, návratnosti investic (ROI) a vyhodnocení uložených tiketů
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
            Bankroll a statistiky
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={onStartFromScratch}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Začít od nuly</span>
          </button>

          <button
            type="button"
            onClick={onResetDemoHistory}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-800 bg-[#111827] px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-slate-100 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
            <span>Obnovit ukázkovou bilanci</span>
          </button>
        </div>
      </div>

      {/* 4-Column KPI Grid */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800/90 bg-[#111827] p-5">
          <span className="block text-xs font-medium text-slate-400">Aktuální kapitál</span>
          <span className="mt-1.5 block font-mono text-2xl font-bold tabular-nums text-slate-50">
            {formatCZK(metrics.currentCapital)}
          </span>
          <span
            className={`mt-1 block font-mono text-xs tabular-nums ${
              metrics.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {metrics.totalProfit >= 0 ? '+' : ''}
            {formatCZK(metrics.totalProfit)} čistý zisk
          </span>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-[#111827] p-5">
          <span className="block text-xs font-medium text-slate-400">Celkové ROI</span>
          <span
            className={`mt-1.5 block font-mono text-2xl font-bold tabular-nums ${
              metrics.roi >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatPercent(metrics.roi, true)}
          </span>
          <span className="mt-1 block font-mono text-xs tabular-nums text-slate-400">
            Vsazeno celkem {formatCZK(metrics.totalStaked)}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-[#111827] p-5">
          <span className="block text-xs font-medium text-slate-400">Úspěšnost tiketů</span>
          <span className="mt-1.5 block font-mono text-2xl font-bold tabular-nums text-slate-50">
            {formatPercent(metrics.winRate)}
          </span>
          <span className="mt-1 block font-mono text-xs tabular-nums text-slate-400">
            {metrics.wonCount} výher / {metrics.settledCount} vyhodnocených
          </span>
        </div>

        <div className="rounded-2xl border border-slate-800/90 bg-[#111827] p-5">
          <span className="block text-xs font-medium text-slate-400">Aktivní tikety (ve hře)</span>
          <span className="mt-1.5 block font-mono text-2xl font-bold tabular-nums text-amber-300">
            {metrics.pendingCount}
          </span>
          <span className="mt-1 block font-mono text-xs tabular-nums text-slate-400">
            Vklad ve hře {formatCZK(metrics.pendingStake)}
          </span>
        </div>
      </section>

      {/* Equity Curve Chart */}
      <section className="rounded-2xl border border-slate-800/90 bg-[#111827] p-5 sm:p-6">
        <div className="flex flex-col gap-2 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-50">Vývoj kapitálu v čase</h2>
            <p className="text-xs text-slate-400">
              Kumulativní křivka bankrollu po každém vyhodnoceném tiketu
            </p>
          </div>
          {activePoint && (
            <div className="text-left sm:text-right">
              <div className="text-xs text-slate-400">
                {activePoint.dateStr} · {activePoint.label}
              </div>
              <div className="font-mono text-base font-bold tabular-nums text-slate-100">
                {formatCZK(activePoint.balance)}
                {activePoint.status !== 'start' && (
                  <span
                    className={`ml-2 text-xs ${
                      activePoint.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    ({activePoint.delta >= 0 ? '+' : ''}
                    {formatCZK(activePoint.delta)})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="h-56 w-full min-w-[460px] sm:h-64"
            role="img"
            aria-label="Graf vývoje kapitálu"
          >
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines & Y-Axis Labels */}
            {yTicks.map((val, i) => {
              const y = getY(val);
              return (
                <g key={i}>
                  <line
                    x1={padL}
                    x2={chartW - padR}
                    y1={y}
                    y2={y}
                    stroke="#1E293B"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padL - 10}
                    y={y + 4}
                    textAnchor="end"
                    fill="#94A3B8"
                    fontSize="11"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {val.toLocaleString('cs-CZ')}
                  </text>
                </g>
              );
            })}

            {/* Area & Line */}
            {equityPoints.length > 1 && (
              <>
                <path d={areaPath} fill="url(#equityGrad)" />
                <path
                  d={linePath}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {/* Data Nodes */}
            {equityPoints.map((pt, idx) => {
              const cx = getX(idx);
              const cy = getY(pt.balance);
              const isHighlighted = hoveredIdx === idx || (hoveredIdx === null && idx === equityPoints.length - 1);
              const dotColor =
                pt.status === 'lost' ? '#F43F5E' : pt.status === 'won' ? '#10B981' : '#94A3B8';

              return (
                <g
                  key={pt.index}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onClick={() => setHoveredIdx(idx)}
                >
                  <circle cx={cx} cy={cy} r={16} fill="transparent" />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHighlighted ? 6 : 4}
                    fill={dotColor}
                    stroke="#090D16"
                    strokeWidth="2"
                  />
                  <text
                    x={cx}
                    y={chartH - 10}
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize="11"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {pt.dateStr}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      {/* Ticket History & Settlement */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg font-bold text-slate-50">Historie uložených tiketů</h2>

          <div
            className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-[#111827] p-1 self-start sm:self-auto"
            role="tablist"
            aria-label="Filtr stavu tiketů"
          >
            {(
              [
                { id: 'all', label: 'Vše' },
                { id: 'pending', label: 'Čekající' },
                { id: 'won', label: 'Vyhrané' },
                { id: 'lost', label: 'Prohrané' },
              ] as { id: StatusFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-slate-800 text-slate-50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTickets.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/90 bg-[#111827] p-8 text-center">
            <p className="text-sm font-medium text-slate-300">
              V této kategorii zatím nemáte žádné tikety.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Vygenerujte si tiket v záložce Generátor tiketu nebo přidejte zápasy z přehledu.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTickets.map((ticket) => {
              const dateLabel = new Date(ticket.createdAt).toLocaleString('cs-CZ', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <article
                  key={ticket.id}
                  className={`rounded-2xl border bg-[#111827] p-5 ${
                    ticket.status === 'won'
                      ? 'border-emerald-500/35'
                      : ticket.status === 'lost'
                      ? 'border-rose-500/30'
                      : 'border-slate-800/90'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-mono tabular-nums">{dateLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{ticket.riskLevel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{ticket.legs.length} příležitostí</span>
                      </div>
                      <h3 className="mt-1 font-display text-base font-bold text-slate-100">
                        {ticket.label}
                      </h3>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-xs font-bold ${
                          ticket.status === 'won'
                            ? 'text-emerald-400'
                            : ticket.status === 'lost'
                            ? 'text-rose-400'
                            : 'text-amber-300'
                        }`}
                      >
                        {ticket.status === 'won'
                          ? `Výhra (+${formatCZK(ticket.profit)})`
                          : ticket.status === 'lost'
                          ? `Prohra (${formatCZK(ticket.profit)})`
                          : 'Čeká na vyhodnocení'}
                      </span>

                      <button
                        type="button"
                        onClick={() => onDeleteTicket(ticket.id)}
                        className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800 hover:text-rose-400"
                        aria-label="Smazat tiket"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Ticket Legs Summary */}
                  <div className="mt-3 divide-y divide-slate-800/70 rounded-xl border border-slate-800/80 bg-[#0B101B]">
                    {ticket.legs.map((leg, i) => (
                      <div
                        key={`${ticket.id}-${leg.matchId}-${i}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-200">
                            {leg.homeTeam} vs. {leg.awayTeam}
                          </span>
                          <span className="mx-2 text-slate-600">·</span>
                          <span className="text-emerald-300">{leg.recommendedPick}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono font-semibold tabular-nums text-slate-200">
                            {formatOdds(leg.betanoOdds)}
                          </span>
                          <a
                            href={BETANO_HOME_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => onOpenBetano(leg.homeTeam, leg.awayTeam)}
                            className="inline-flex items-center gap-1 text-slate-400 hover:text-emerald-300"
                            title="Otevřít na Betanu"
                          >
                            <span>Betano</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Financial Strip & Settlement Actions */}
                  <div className="mt-4 flex flex-col gap-3 border-t border-slate-800/70 pt-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-5 text-xs">
                      <div>
                        <span className="text-slate-400">Celkový kurz: </span>
                        <strong className="font-mono tabular-nums text-slate-100">
                          {formatOdds(ticket.totalOdds)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Vklad: </span>
                        <strong className="font-mono tabular-nums text-slate-100">
                          {formatCZK(ticket.actualStake)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Možná výhra: </span>
                        <strong className="font-mono tabular-nums text-emerald-300">
                          {formatCZK(ticket.potentialWin)}
                        </strong>
                      </div>
                    </div>

                    {ticket.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSettleTicket(ticket.id, 'won')}
                          className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 sm:flex-initial"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Výhra</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSettleTicket(ticket.id, 'lost')}
                          className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/25 sm:flex-initial"
                        >
                          <XCircle className="h-4 w-4" />
                          <span>Prohra</span>
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
