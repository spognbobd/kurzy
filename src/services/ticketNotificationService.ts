import {
  AppSettings,
  MatchAnalysis,
  NotificationLeadMinutes,
  Ticket,
  TicketLeg,
} from '../types/betting';
import { formatCZK } from '../utils/analyticsEngine';

const NOTIFIED_TICKETS_STORAGE_KEY = 'betedge_notified_tickets_v1';
const MAX_START_GRACE_MS = 4 * 60 * 60 * 1000; // Do not notify for stale pending tickets older than 4h past kickoff

export interface TicketNotificationRecord {
  startNotified?: boolean;
  winNotified?: boolean;
  updatedAt: number;
}

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

const CZECH_WEEKDAYS: Record<string, number> = {
  neděle: 0,
  pondělí: 1,
  úterý: 2,
  středa: 3,
  čtvrtek: 4,
  pátek: 5,
  sobota: 6,
};

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  try {
    if (window.Notification.permission === 'granted') {
      return 'granted';
    }
    const result = await window.Notification.requestPermission();
    return result;
  } catch {
    return window.Notification.permission ?? 'denied';
  }
}

export function loadNotifiedTicketsMap(): Record<string, TicketNotificationRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(NOTIFIED_TICKETS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, TicketNotificationRecord>;
  } catch {
    return {};
  }
}

function saveNotifiedTicketsMap(map: Record<string, TicketNotificationRecord>): void {
  if (typeof window === 'undefined') return;
  try {
    // Prune entries older than 60 days to keep localStorage bounded
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const pruned: Record<string, TicketNotificationRecord> = {};
    for (const [id, rec] of Object.entries(map)) {
      if (rec && typeof rec === 'object' && (rec.updatedAt ?? Date.now()) >= cutoff) {
        pruned[id] = rec;
      }
    }
    window.localStorage.setItem(NOTIFIED_TICKETS_STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // Ignore storage quota errors
  }
}

export function markTicketNotified(
  ticketId: string,
  kind: 'start' | 'win'
): Record<string, TicketNotificationRecord> {
  const map = loadNotifiedTicketsMap();
  const prev = map[ticketId] ?? { updatedAt: Date.now() };
  map[ticketId] = {
    ...prev,
    startNotified: kind === 'start' ? true : prev.startNotified,
    winNotified: kind === 'win' ? true : prev.winNotified,
    updatedAt: Date.now(),
  };
  saveNotifiedTicketsMap(map);
  return map;
}

function parseKickoffTimeFallback(kickoffTime: string, ticketCreatedAtIso: string): number | null {
  const baseMs = Date.parse(ticketCreatedAtIso);
  const baseDate = Number.isFinite(baseMs) ? new Date(baseMs) : new Date();
  const clean = kickoffTime.trim();

  // Explicit DD.MM. HH:MM
  const dateMatch = clean.match(/^(\d{1,2})\.(\d{1,2})\.\s+(\d{1,2}):(\d{2})$/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]) - 1;
    const hour = Number(dateMatch[3]);
    const minute = Number(dateMatch[4]);
    const dt = new Date(baseDate.getFullYear(), month, day, hour, minute, 0, 0);
    return Number.isFinite(dt.getTime()) ? dt.getTime() : null;
  }

  // Relative Czech labels: "Dnes 20:45", "Zítra 18:00", "Sobota 19:00"
  const relMatch = clean.match(/^([A-Za-zÀ-ž]+)\s+(\d{1,2}):(\d{2})$/);
  if (relMatch) {
    const dayToken = relMatch[1].toLowerCase();
    const hour = Number(relMatch[2]);
    const minute = Number(relMatch[3]);
    const dt = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hour, minute, 0, 0);

    if (dayToken === 'dnes') {
      return dt.getTime();
    }
    if (dayToken === 'zítra') {
      dt.setDate(dt.getDate() + 1);
      return dt.getTime();
    }
    if (dayToken in CZECH_WEEKDAYS) {
      const targetDow = CZECH_WEEKDAYS[dayToken];
      const deltaDays = (targetDow - dt.getDay() + 7) % 7;
      dt.setDate(dt.getDate() + deltaDays);
      return dt.getTime();
    }
  }

  if (clean.toLowerCase().includes('vlastní') && Number.isFinite(baseMs)) {
    return baseMs;
  }

  return null;
}

export function resolveLegKickoffTimestamp(
  leg: TicketLeg,
  ticketCreatedAtIso: string,
  activeMatches: MatchAnalysis[] = []
): number | null {
  if (leg.kickoffIso) {
    const parsed = Date.parse(leg.kickoffIso);
    if (Number.isFinite(parsed)) return parsed;
  }

  const matched = activeMatches.find((m) => m.id === leg.matchId);
  if (matched?.kickoffIso) {
    const parsed = Date.parse(matched.kickoffIso);
    if (Number.isFinite(parsed)) return parsed;
  }

  return parseKickoffTimeFallback(leg.kickoffTime, ticketCreatedAtIso);
}

export interface EarliestTicketMatchInfo {
  leg: TicketLeg;
  kickoffMs: number;
}

export function getTicketEarliestMatchInfo(
  ticket: Ticket,
  activeMatches: MatchAnalysis[] = []
): EarliestTicketMatchInfo | null {
  let earliest: EarliestTicketMatchInfo | null = null;

  for (const leg of ticket.legs) {
    const kickoffMs = resolveLegKickoffTimestamp(leg, ticket.createdAt, activeMatches);
    if (kickoffMs === null) continue;
    if (!earliest || kickoffMs < earliest.kickoffMs) {
      earliest = { leg, kickoffMs };
    }
  }

  return earliest;
}

export interface TicketCountdownStatus {
  state: 'upcoming' | 'live';
  label: string;
  kickoffMs: number;
  matchTitle: string;
}

export function formatTicketCountdownStatus(
  ticket: Ticket,
  nowMs: number,
  activeMatches: MatchAnalysis[] = []
): TicketCountdownStatus | null {
  if (ticket.status !== 'pending') return null;

  const earliest = getTicketEarliestMatchInfo(ticket, activeMatches);
  if (!earliest) return null;

  const { leg, kickoffMs } = earliest;
  const matchTitle = `${leg.homeTeam} vs. ${leg.awayTeam}`;
  const diffMs = kickoffMs - nowMs;

  if (diffMs <= 0) {
    return {
      state: 'live',
      label: 'Právě se hraje',
      kickoffMs,
      matchTitle,
    };
  }

  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60000));
  if (totalMinutes < 60) {
    return {
      state: 'upcoming',
      label: `Začíná za ${totalMinutes} min`,
      kickoffMs,
      matchTitle,
    };
  }

  if (totalMinutes < 24 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return {
      state: 'upcoming',
      label: mins === 0 ? `Začíná za ${hours} h` : `Začíná za ${hours} h ${mins} min`,
      kickoffMs,
      matchTitle,
    };
  }

  const days = Math.floor(totalMinutes / (24 * 60));
  const remHours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const daysWord = days === 1 ? '1 den' : days <= 4 ? `${days} dny` : `${days} dnů`;
  return {
    state: 'upcoming',
    label: remHours > 0 ? `Začíná za ${daysWord} ${remHours} h` : `Začíná za ${daysWord}`,
    kickoffMs,
    matchTitle,
  };
}

function sendBrowserNotification(title: string, body: string, tag: string): boolean {
  if (!isBrowserNotificationSupported() || window.Notification.permission !== 'granted') {
    return false;
  }

  try {
    new window.Notification(title, {
      body,
      tag,
      icon: '/pwa-192x192.png',
    });
    return true;
  } catch {
    // Fallback for mobile Chrome / Android PWA contexts that require ServiceWorkerRegistration.showNotification
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (reg) {
            return reg.showNotification(title, {
              body,
              tag,
              icon: '/pwa-192x192.png',
            });
          }
          return undefined;
        })
        .catch(() => {
          // Ignore SW notification failures
        });
      return true;
    }
    return false;
  }
}

export function checkAndSendMatchStartNotifications(
  tickets: Ticket[],
  settings: Pick<AppSettings, 'notificationsEnabled' | 'notificationLeadMinutes'>,
  activeMatches: MatchAnalysis[] = [],
  nowMs = Date.now()
): number {
  if (!settings.notificationsEnabled) return 0;
  if (!isBrowserNotificationSupported() || window.Notification.permission !== 'granted') {
    return 0;
  }

  const leadMinutes: NotificationLeadMinutes =
    settings.notificationLeadMinutes === 0 ? 0 : 15;
  const leadMs = leadMinutes * 60 * 1000;
  const notifiedMap = loadNotifiedTicketsMap();
  let sentCount = 0;

  for (const ticket of tickets) {
    if (ticket.status !== 'pending') continue;
    if (notifiedMap[ticket.id]?.startNotified) continue;

    const earliest = getTicketEarliestMatchInfo(ticket, activeMatches);
    if (!earliest) continue;

    const msUntilStart = earliest.kickoffMs - nowMs;
    if (msUntilStart > leadMs || msUntilStart < -MAX_START_GRACE_MS) {
      continue;
    }

    const matchName = `${earliest.leg.homeTeam} vs. ${earliest.leg.awayTeam}`;
    const title =
      msUntilStart <= 0
        ? `Právě začíná: ${matchName}`
        : `Začíná za ${Math.max(1, Math.ceil(msUntilStart / 60000))} min: ${matchName}`;
    const body = `Tiket: ${ticket.label} · Vklad ${formatCZK(ticket.actualStake)} · Možná výhra ${formatCZK(
      ticket.potentialWin
    )}`;

    if (sendBrowserNotification(title, body, `betedge-start-${ticket.id}`)) {
      markTicketNotified(ticket.id, 'start');
      sentCount += 1;
    }
  }

  return sentCount;
}

export function notifyTicketWinIfEligible(
  ticket: Ticket,
  settings: Pick<AppSettings, 'notificationsEnabled'>
): boolean {
  // Strictly notify ONLY on winning tickets with positive payout/profit — complete silence on loss or refund
  if (ticket.status !== 'won' || ticket.profit <= 0) {
    return false;
  }
  if (!settings.notificationsEnabled) {
    return false;
  }
  if (!isBrowserNotificationSupported() || window.Notification.permission !== 'granted') {
    return false;
  }

  const notifiedMap = loadNotifiedTicketsMap();
  if (notifiedMap[ticket.id]?.winNotified) {
    return false;
  }

  const title = '🏆 Výherní tiket!';
  const body = `Vyhrál jsi +${formatCZK(ticket.potentialWin)} (čistý zisk +${formatCZK(
    ticket.profit
  )}) · ${ticket.label}`;

  if (sendBrowserNotification(title, body, `betedge-win-${ticket.id}`)) {
    markTicketNotified(ticket.id, 'win');
    return true;
  }

  return false;
}
