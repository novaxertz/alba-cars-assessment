/**
 * Seeds two dealers with overlapping-looking but strictly separate inventory.
 *
 * Two users exist on purpose: the security boundary is only worth testing if there is
 * someone else's data to fail to read. Dealer B's rows are what `npm run verify:rls`
 * tries, and fails, to see as dealer A.
 *
 * Uses the service_role key, which bypasses RLS — so every owner_id is set explicitly
 * rather than relying on the auth.uid() default.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Fleet shaped to make the ageing chart tell a story, not to look tidy. */
const DEALER_A = [
  // fresh stock, still healthy
  { vin: 'JTDKB20U1930012', make: 'Toyota', model: 'Corolla',    year: 2021, mileage_km:  48000, acquired: 12,  cost: 42000, list: 51000 },
  { vin: 'WDDGF8AB1EA91123', make: 'Mercedes-Benz', model: 'C 200', year: 2020, mileage_km: 62000, acquired: 21, cost: 78000, list: 94000 },
  { vin: 'JN1BJ0RP8HM40021', make: 'Nissan', model: 'Rogue',     year: 2019, mileage_km:  71000, acquired: 29,  cost: 38000, list: 46000 },
  // the middle, where attention starts to be needed
  { vin: 'WBA8E9G59GNT10093', make: 'BMW', model: '320i',        year: 2019, mileage_km:  84000, acquired: 44,  cost: 61000, list: 72000, markdowns: [[72000, 69500, 'manual']] },
  { vin: '1FTFW1ET5DFA22871', make: 'Ford', model: 'F-150',      year: 2018, mileage_km: 112000, acquired: 58,  cost: 55000, list: 63000 },
  // ageing, already marked down more than once
  { vin: 'KMHD84LF5HU11934', make: 'Hyundai', model: 'Elantra',  year: 2018, mileage_km:  96000, acquired: 73,  cost: 27000, list: 31000, markdowns: [[33000, 32000, 'manual'], [32000, 31000, 'scheduled_markdown']] },
  { vin: 'SALGS2SE8LA50021', make: 'Land Rover', model: 'Range Rover', year: 2017, mileage_km: 128000, acquired: 86, cost: 148000, list: 159000, markdowns: [[172000, 165000, 'manual'], [165000, 159000, 'scheduled_markdown']] },
  // the units that are genuinely bleeding
  { vin: 'WP0AB2A75JL13322', make: 'Porsche', model: '718 Cayman', year: 2018, mileage_km: 59000, acquired: 121, cost: 210000, list: 219000, markdowns: [[239000, 229000, 'manual'], [229000, 219000, 'scheduled_markdown']] },
  { vin: 'JTHBK1GG3F21100A', make: 'Lexus', model: 'ES 350',     year: 2016, mileage_km: 154000, acquired: 148, cost: 44000, list: 47500, markdowns: [[54000, 51000, 'manual'], [51000, 49000, 'scheduled_markdown'], [49000, 47500, 'automation']] },
  // A real, decodable VIN on purpose. This 2006 Ranger carries four Takata "do not
  // drive" recalls, so the recall check in 01 flags it and the nightly agent in 03
  // routes it away from the markdown path entirely — you do not discount a car you
  // should not be retailing, you get the recall done first.
  { vin: '1FTZR45E36PA12345', make: 'Ford', model: 'Ranger',     year: 2006, mileage_km: 178000, acquired: 104, cost: 19000, list: 24000, markdowns: [[26000, 24000, 'manual']] },
  // one already sold, so the charts have a completed life cycle in them
  { vin: 'MALA751AAFM30012', make: 'Kia', model: 'Rio',          year: 2019, mileage_km:  67000, acquired: 96,  cost: 23000, list: 28000, soldAfter: 71, soldFor: 27000 },
];

const DEALER_B = [
  { vin: 'VF1RFA00X54900211', make: 'Renault', model: 'Duster',  year: 2020, mileage_km: 55000, acquired: 18, cost: 31000, list: 37500 },
  { vin: 'MMBJNKL10LH00931', make: 'Mitsubishi', model: 'Pajero', year: 2019, mileage_km: 88000, acquired: 52, cost: 59000, list: 68000 },
  { vin: 'LSGHD52H4FD10022', make: 'Chevrolet', model: 'Malibu', year: 2018, mileage_km: 102000, acquired: 134, cost: 29000, list: 33000, markdowns: [[37000, 33000, 'manual']] },
];

async function ensureUser(email, password, fullName) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (!error) return created.user;

  // Re-runnable: if the account already exists, find it rather than failing the seed.
  if (!/already/i.test(error.message)) throw error;
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw error;
  return existing;
}

async function seedDealer(user, fleet, holdingRate) {
  await admin.from('dealer_settings')
    .upsert({ owner_id: user.id, daily_holding_cost_aed: holdingRate });

  // Start clean so re-running the seed does not pile up duplicate inventory.
  await admin.from('vehicles').delete().eq('owner_id', user.id);

  for (const v of fleet) {
    const startingPrice = v.markdowns?.[0]?.[0] ?? v.list;

    const { data: row, error } = await admin.from('vehicles').insert({
      owner_id: user.id,
      vin: v.vin,
      make: v.make,
      model: v.model,
      year: v.year,
      mileage_km: v.mileage_km,
      acquired_at: daysAgo(v.acquired),
      acquisition_cost_aed: v.cost,
      list_price_aed: startingPrice,
    }).select('id').single();
    if (error) throw error;

    // Apply markdowns as real updates so the database trigger writes the history.
    // The decay curve is therefore produced the same way it will be in the live app.
    for (const [, newPrice, reason] of v.markdowns ?? []) {
      const { error: e } = await admin.from('vehicles')
        .update({ list_price_aed: newPrice, price_change_reason: reason })
        .eq('id', row.id);
      if (e) throw e;
    }

    // The trigger stamps changed_at with now(), so a freshly seeded lot has every
    // markdown landing today and the decay chart becomes a straight interpolation.
    // Spread them across the car's life so the history looks like history. Only the
    // seed does this, using the service role — the app can never rewrite a timestamp.
    const changes = v.markdowns ?? [];
    if (changes.length) {
      const { data: logged } = await admin.from('price_changes')
        .select('id').eq('vehicle_id', row.id).order('changed_at', { ascending: true });

      // first markdown around 45% of the way through, last one a week ago
      const spread = logged.map((_, i) =>
        Math.round(v.acquired * (0.45 + (0.45 * i) / Math.max(1, logged.length - 1 || 1))),
      );

      for (const [i, rec] of logged.entries()) {
        const daysBack = Math.max(4, v.acquired - Math.min(spread[i], v.acquired - 4));
        await admin.from('price_changes')
          .update({ changed_at: new Date(Date.now() - daysBack * 86400000).toISOString() })
          .eq('id', rec.id);
      }
    }

    if (v.soldAfter != null) {
      const { error: e } = await admin.from('vehicles').update({
        status: 'sold',
        sold_at: daysAgo(v.acquired - v.soldAfter),
        sold_price_aed: v.soldFor,
      }).eq('id', row.id);
      if (e) throw e;
    }
  }
  return fleet.length;
}

const a = await ensureUser(env.SEED_USER_A_EMAIL, env.SEED_USER_A_PASSWORD, 'Dealer A — Al Quoz');
const b = await ensureUser(env.SEED_USER_B_EMAIL, env.SEED_USER_B_PASSWORD, 'Dealer B — Deira');

const countA = await seedDealer(a, DEALER_A, 45);
const countB = await seedDealer(b, DEALER_B, 38);

console.log(`seeded ${countA} vehicles for ${a.email}`);
console.log(`seeded ${countB} vehicles for ${b.email}`);
console.log('\nsign in as either account with the passwords from .env.local');
