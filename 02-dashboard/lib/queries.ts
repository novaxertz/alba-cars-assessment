import { createClient } from './supabase/server';
import type { AgeingRow, SummaryRow, PriceChange, Vehicle } from './types';

/**
 * Every read below goes through the caller's session. There is no server-side
 * privilege escalation anywhere in this app: the same row-level security that
 * protects the REST API protects these queries, so a bug here cannot widen access.
 */

export async function getAgeing(): Promise<AgeingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vehicle_ageing')
    .select('*')
    .order('days_on_lot', { ascending: false });
  if (error) throw new Error(`Could not load inventory: ${error.message}`);
  return data as AgeingRow[];
}

/** Aggregated in Postgres, not in the browser. */
export async function getSummary(): Promise<SummaryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('inventory_ageing_summary');
  if (error) throw new Error(`Could not load summary: ${error.message}`);
  return (data ?? []) as SummaryRow[];
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('vehicles').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Could not load vehicle: ${error.message}`);
  return data as Vehicle | null;
}

export async function getAgeingRow(id: string): Promise<AgeingRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('vehicle_ageing').select('*').eq('id', id).maybeSingle();
  return (data as AgeingRow) ?? null;
}

export async function getPriceHistory(id: string): Promise<PriceChange[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('price_changes')
    .select('*')
    .eq('vehicle_id', id)
    .order('changed_at', { ascending: true });
  if (error) throw new Error(`Could not load price history: ${error.message}`);
  return data as PriceChange[];
}

/** The decay chart: the most-aged units that have actually been marked down. */
export async function getDecaySeries(limit = 4) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('vehicle_ageing')
    .select('id, make, model, acquisition_cost_aed, list_price_aed, days_on_lot, total_markdown_aed')
    .gt('total_markdown_aed', 0)
    .order('days_on_lot', { ascending: false })
    .limit(limit);

  if (!rows?.length) return [];

  const { data: history } = await supabase
    .from('price_changes')
    .select('vehicle_id, old_price_aed, new_price_aed, changed_at')
    .in('vehicle_id', rows.map((r) => r.id))
    .order('changed_at', { ascending: true });

  return rows.map((r) => {
    const mine = (history ?? []).filter((h) => h.vehicle_id === r.id);
    const points = [
      // the price it was first listed at, before any markdown
      { day: 0, price: mine[0]?.old_price_aed ?? r.list_price_aed },
      ...mine.map((h) => ({
        day: Math.max(
          0,
          r.days_on_lot -
            Math.round((Date.now() - new Date(h.changed_at).getTime()) / 86_400_000),
        ),
        price: h.new_price_aed,
      })),
      { day: r.days_on_lot, price: r.list_price_aed },
    ];
    return { id: r.id, label: `${r.make} ${r.model}`, cost: r.acquisition_cost_aed, points };
  });
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
