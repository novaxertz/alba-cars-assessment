/**
 * The part that is not a wrapper.
 *
 * NHTSA publishes recalls (what the manufacturer has admitted) and complaints (what
 * owners actually report). Neither dataset is interesting on its own — the recall list
 * is on every car site, and 271 raw complaints are unreadable. The value is in the
 * disagreement between them, and that only exists if you compute it:
 *
 *   1. group complaints by component and weight them by whether anyone was hurt
 *   2. line each component up against the campaigns that cover it
 *   3. for covered components, report the campaign years and how much is still being
 *      reported recently — as evidence, not as a verdict (see below)
 *   4. surface components with real complaint volume and NO campaign at all
 *
 * All of this happens on the server. The browser receives a verdict per component, not
 * hundreds of rows to crunch.
 *
 * A causal verdict was built here and then deliberately removed.
 *
 * The first version scored each recalled component as "remedy held" or "still reported"
 * by comparing complaints before and after the campaign opened. Tested against a 2006
 * Ford Ranger, it read 172 before and 0 after — which looks decisive and is an artefact:
 * a further airbag campaign opened in 2025, so "after" was a window a few months long.
 * Anchoring to the FIRST campaign instead inverts the distortion, because complaints
 * spike when a recall is announced — publicity drives reporting, not new failures.
 *
 * Neither anchor supports a causal claim, so the claim is gone. What remains is
 * evidence: complaints per year, campaign years marked alongside them, and how much is
 * still being reported recently. The reader draws the inference from the shape; the app
 * does not assert one it cannot defend.
 *
 * The one verdict kept is "unacknowledged" — no campaign covers this component at all.
 * That is a fact about the two datasets, not an inference about cause.
 */

import type { Recall } from './nhtsa';

export type Complaint = {
  odiNumber: number;
  components: string;
  summary: string;
  dateComplaintFiled: string;
  crash: boolean;
  fire: boolean;
  injuries: number;
  deaths: number;
};

export type ComponentFinding = {
  component: string;
  complaints: number;
  harmCount: number;          // complaints involving a crash, fire, injury or death
  deaths: number;
  campaigns: string[];        // campaign numbers covering this component
  firstCampaignYear: number | null;
  lastCampaignYear: number | null;
  peakYear: number | null;    // the year this component drew the most complaints
  peakCount: number;
  recentComplaints: number;   // filed in the last 36 months — still happening, or not
  verdict: 'unacknowledged' | 'covered';
};

export type Timeline = { year: number; complaints: number; harm: number }[];

export type Analysis = {
  totalComplaints: number;
  totalCampaigns: number;
  harmTotal: number;
  deathsTotal: number;
  unacknowledgedShare: number;   // 0–1, share of complaints with no campaign behind them
  findings: ComponentFinding[];
  timeline: Timeline;
  campaignMarkers: { year: number; count: number }[];
  windowFrom: number | null;
  windowTo: number | null;
};

const parseDate = (s: string | undefined): Date | null => {
  if (!s) return null;
  const [m, d, y] = s.split('/').map(Number);
  if (!m || !d || !y) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Coarse token overlap: NHTSA words components differently in the two datasets —
 *  "AIR BAGS" in a complaint against "AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE" in
 *  a recall. Matching on shared significant words is deliberately loose; an exact match
 *  would report almost everything as unacknowledged, which would be worse than useless. */
const tokens = (s: string) =>
  new Set(
    s.toUpperCase().split(/[^A-Z]+/).filter((w) => w.length > 3 && !STOP.has(w)),
  );

const STOP = new Set(['WITH', 'FROM', 'THAT', 'THIS', 'OTHER', 'UNKNOWN', 'SYSTEM']);

const isHarm = (c: Complaint) => c.crash || c.fire || c.injuries > 0 || c.deaths > 0;

export function analyse(recalls: Recall[], complaints: Complaint[]): Analysis {
  const byComponent = new Map<string, Complaint[]>();

  for (const c of complaints) {
    const key = (c.components || 'UNKNOWN').split(',')[0].trim().toUpperCase() || 'UNKNOWN';
    const list = byComponent.get(key);
    if (list) list.push(c);
    else byComponent.set(key, [c]);
  }

  const findings: ComponentFinding[] = [];

  for (const [component, list] of byComponent) {
    const words = tokens(component);

    const covering = recalls.filter((r) => {
      const rw = tokens(r.component);
      for (const w of words) if (rw.has(w)) return true;
      return false;
    });

    const openedDates = covering
      .map((r) => parseDate(r.reportReceivedDate ?? undefined))
      .filter((d): d is Date => d !== null);
    const lastOpened = openedDates.length ? new Date(Math.max(...openedDates.map((d) => d.getTime()))) : null;

    const firstOpened = openedDates.length ? new Date(Math.min(...openedDates.map((d) => d.getTime()))) : null;

    const perYear = new Map<number, number>();
    let recentComplaints = 0;
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 3);

    for (const c of list) {
      const filed = parseDate(c.dateComplaintFiled);
      if (!filed) continue;
      perYear.set(filed.getFullYear(), (perYear.get(filed.getFullYear()) ?? 0) + 1);
      if (filed >= cutoff) recentComplaints++;
    }

    let peakYear: number | null = null;
    let peakCount = 0;
    for (const [year, n] of perYear) if (n > peakCount) { peakCount = n; peakYear = year; }

    findings.push({
      component,
      complaints: list.length,
      harmCount: list.filter(isHarm).length,
      deaths: list.reduce((n, c) => n + c.deaths, 0),
      campaigns: covering.map((r) => r.campaignNumber),
      firstCampaignYear: firstOpened ? firstOpened.getFullYear() : null,
      lastCampaignYear: lastOpened ? lastOpened.getFullYear() : null,
      peakYear,
      peakCount,
      recentComplaints,
      verdict: covering.length === 0 ? 'unacknowledged' : 'covered',
    });
  }

  // Sort by what a buyer should look at first: harm, then volume.
  findings.sort((a, b) => b.harmCount - a.harmCount || b.complaints - a.complaints);

  const years = new Map<number, { complaints: number; harm: number }>();
  for (const c of complaints) {
    const filed = parseDate(c.dateComplaintFiled);
    if (!filed) continue;
    const y = filed.getFullYear();
    const row = years.get(y) ?? { complaints: 0, harm: 0 };
    row.complaints++;
    if (isHarm(c)) row.harm++;
    years.set(y, row);
  }

  const campaignYears = new Map<number, number>();
  for (const r of recalls) {
    const opened = parseDate(r.reportReceivedDate ?? undefined);
    if (opened) campaignYears.set(opened.getFullYear(), (campaignYears.get(opened.getFullYear()) ?? 0) + 1);
  }

  const allYears = [...new Set([...years.keys(), ...campaignYears.keys()])].sort((a, b) => a - b);
  // Trim a long quiet tail at the start — a single complaint in 2006 is not a trend.
  const meaningful = allYears.filter((y) => (years.get(y)?.complaints ?? 0) > 1 || campaignYears.has(y));
  const from = meaningful[0] ?? allYears[0] ?? null;
  const to = allYears[allYears.length - 1] ?? null;

  const timeline: Timeline =
    from !== null && to !== null
      ? Array.from({ length: to - from + 1 }, (_, i) => {
          const year = from + i;
          const row = years.get(year);
          return { year, complaints: row?.complaints ?? 0, harm: row?.harm ?? 0 };
        })
      : [];

  const unacknowledged = findings
    .filter((f) => f.verdict === 'unacknowledged')
    .reduce((n, f) => n + f.complaints, 0);

  return {
    totalComplaints: complaints.length,
    totalCampaigns: recalls.length,
    harmTotal: complaints.filter(isHarm).length,
    deathsTotal: complaints.reduce((n, c) => n + c.deaths, 0),
    unacknowledgedShare: complaints.length ? unacknowledged / complaints.length : 0,
    findings,
    timeline,
    campaignMarkers: [...campaignYears.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year),
    windowFrom: from,
    windowTo: to,
  };
}
