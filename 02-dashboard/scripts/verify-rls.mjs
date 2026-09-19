/**
 * Proves the security boundary rather than asserting it.
 *
 * Signs in as dealer A with the anon key — exactly what a browser has — and then tries,
 * nine different ways, to reach dealer B's data. Every attempt must come back empty or
 * refused. The three read paths are tested separately because they can fail
 * independently: the table is protected by its policy, the view only because it is
 * declared security_invoker, and the RPC only because it runs as the caller. A view
 * that forgot security_invoker would leak every dealer's totals while the table
 * underneath looked perfectly locked.
 *
 * Storage is checked too. A private bucket is only private if its policies say so, and
 * "the bucket is set to private" is exactly the kind of claim that is easy to make and
 * easy to get wrong — so dealer A uploads a photo and dealer B is made to try to read
 * it, download it, and write into A's folder.
 *
 * Run: npm run verify:rls
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
const check = (name, passed, detail) => {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!passed) failures++;
};

// --- find B's data using the service role, which bypasses RLS on purpose -----------
const { data: users } = await admin.auth.admin.listUsers();
const userA = users.users.find((u) => u.email === env.SEED_USER_A_EMAIL);
const userB = users.users.find((u) => u.email === env.SEED_USER_B_EMAIL);
if (!userA || !userB) throw new Error('seed users missing — run npm run seed first');

const { data: bVehicles } = await admin.from('vehicles').select('id, vin').eq('owner_id', userB.id);
const { data: aVehicles } = await admin.from('vehicles').select('id').eq('owner_id', userA.id);
const bVehicle = bVehicles[0];
console.log(`dealer B owns ${bVehicles.length} vehicles; dealer A owns ${aVehicles.length}`);
console.log(`target row: ${bVehicle.vin} (${bVehicle.id})\n`);

// --- now become dealer A, with nothing but the anon key ----------------------------
const asA = createClient(URL_, ANON, { auth: { persistSession: false } });
const { error: signInError } = await asA.auth.signInWithPassword({
  email: env.SEED_USER_A_EMAIL,
  password: env.SEED_USER_A_PASSWORD,
});
if (signInError) throw signInError;

// 1. the table, by owner
const r1 = await asA.from('vehicles').select('id').eq('owner_id', userB.id);
check("A reads B's vehicles by owner_id", r1.data?.length === 0, `${r1.data?.length ?? '?'} rows`);

// 2. the table, by primary key — no filter to hide behind
const r2 = await asA.from('vehicles').select('id, vin').eq('id', bVehicle.id);
check("A reads B's vehicle by its exact id", r2.data?.length === 0, `${r2.data?.length ?? '?'} rows`);

// 3. unfiltered select returns only A's own rows
const r3 = await asA.from('vehicles').select('id, owner_id');
check(
  'A unfiltered select returns only A rows',
  r3.data?.length === aVehicles.length && r3.data.every((v) => v.owner_id === userA.id),
  `${r3.data?.length ?? '?'} rows, expected ${aVehicles.length}`,
);

// 4. the price history of B's car
const r4 = await asA.from('price_changes').select('id').eq('vehicle_id', bVehicle.id);
check("A reads B's price history", r4.data?.length === 0, `${r4.data?.length ?? '?'} rows`);

// 5. the view — protected only by security_invoker
const r5 = await asA.from('vehicle_ageing').select('id').eq('owner_id', userB.id);
check("A reads B's rows through the ageing view", r5.data?.length === 0, `${r5.data?.length ?? '?'} rows`);

// 6. the RPC — the aggregate must not total B's inventory into A's answer
const r6 = await asA.rpc('inventory_ageing_summary');
const rpcTotal = (r6.data ?? []).reduce((n, row) => n + Number(row.vehicle_count), 0);
const { count: aUnsold } = await admin.from('vehicles')
  .select('id', { count: 'exact', head: true }).eq('owner_id', userA.id).neq('status', 'sold');
check('RPC totals cover only A inventory', rpcTotal === aUnsold, `RPC counted ${rpcTotal}, A owns ${aUnsold} unsold`);

// 7. writing to B's row
const r7 = await asA.from('vehicles').update({ list_price_aed: 1 }).eq('id', bVehicle.id).select();
check("A cannot update B's vehicle", (r7.data?.length ?? 0) === 0, r7.error ? 'refused' : `${r7.data?.length} rows changed`);

// 8. inserting a row owned by B
const r8 = await asA.from('vehicles').insert({
  owner_id: userB.id, vin: 'RLSPROBE00000001', make: 'Probe', model: 'X',
  year: 2020, mileage_km: 1, acquired_at: '2026-01-01',
  acquisition_cost_aed: 1000, list_price_aed: 2000,
}).select();
check('A cannot insert a row owned by B', !!r8.error, r8.error ? 'refused by policy' : 'INSERT SUCCEEDED');

// 9. forging price history by hand (no insert policy exists on that table at all)
const r9 = await asA.from('price_changes').insert({
  vehicle_id: aVehicles[0].id, owner_id: userA.id, old_price_aed: 100, new_price_aed: 50,
}).select();
check('Nobody can hand-write price history', !!r9.error, r9.error ? 'refused by policy' : 'INSERT SUCCEEDED');

// 10. signed out entirely
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
const r10 = await anon.from('vehicles').select('id');
check('Signed-out reader sees nothing', (r10.data?.length ?? 0) === 0, `${r10.data?.length ?? '?'} rows`);

// --- storage -----------------------------------------------------------------------
console.log('\n--- private bucket ---');

const asB = createClient(URL_, ANON, { auth: { persistSession: false } });
await asB.auth.signInWithPassword({
  email: env.SEED_USER_B_EMAIL,
  password: env.SEED_USER_B_PASSWORD,
});

// A 1x1 PNG. The content is irrelevant; the path is what the policies read.
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const { data: aVehicle } = await admin.from('vehicles').select('id').eq('owner_id', userA.id).limit(1).single();
const aPath = `${userA.id}/${aVehicle.id}/boundary-probe.png`;

const upload = await asA.storage.from('vehicle-photos').upload(aPath, pixel, {
  contentType: 'image/png',
  upsert: true,
});
check('A can upload into its own folder', !upload.error, upload.error?.message ?? 'uploaded');

// 11. B downloads A's photo by its exact path
const bDownload = await asB.storage.from('vehicle-photos').download(aPath);
check("B cannot download A's photo by path", !!bDownload.error, bDownload.error ? 'refused' : 'DOWNLOADED');

// 12. B lists A's folder
const bList = await asB.storage.from('vehicle-photos').list(`${userA.id}/${aVehicle.id}`);
check("B cannot list A's folder", (bList.data?.length ?? 0) === 0, `${bList.data?.length ?? 0} objects visible`);

// 13. B writes into A's folder
const bWrite = await asB.storage.from('vehicle-photos').upload(`${userA.id}/intruder.png`, pixel, {
  contentType: 'image/png',
});
check("B cannot upload into A's folder", !!bWrite.error, bWrite.error ? 'refused by policy' : 'UPLOAD SUCCEEDED');

// 14. the object has no public URL, signed or not
const publicUrl = asB.storage.from('vehicle-photos').getPublicUrl(aPath).data.publicUrl;
const anonFetch = await fetch(publicUrl);
check('The bucket is not publicly readable', !anonFetch.ok, `public URL returned ${anonFetch.status}`);

// 15. A can still sign its own object
const { data: signed } = await asA.storage.from('vehicle-photos').createSignedUrl(aPath, 60);
const signedFetch = signed?.signedUrl ? await fetch(signed.signedUrl) : null;
check('A can read its own photo through a signed URL', signedFetch?.ok === true, `signed URL returned ${signedFetch?.status ?? 'none'}`);

// tidy up
await admin.storage.from('vehicle-photos').remove([aPath, `${userA.id}/intruder.png`]);

// --- realtime ----------------------------------------------------------------------
// A socket is a second way out of the database, and it would be easy to secure the REST
// API and leave this open. Supabase evaluates the subscriber's policies before
// delivering a change - so dealer B, listening on the same channel name as dealer A,
// should hear its own rows and nothing of A's.
console.log('\n--- realtime ---');

const heard = { own: false, other: false };

// Attach B's token to the socket before subscribing. Realtime evaluates RLS against
// the subscriber's JWT, so a channel opened without it is anonymous: it subscribes,
// reports SUBSCRIBED, and receives nothing. That is exactly how this failed first time.
const { data: bSession } = await asB.auth.getSession();
await asB.realtime.setAuth(bSession.session.access_token);

const channel = asB
  .channel('lot-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, (payload) => {
    const row = payload.new ?? payload.old ?? {};
    if (row.owner_id === userB.id) heard.own = true;
    if (row.owner_id === userA.id) heard.other = true;
  });

const subscribed = await new Promise((resolve) => {
  const t = setTimeout(() => resolve(false), 12000);
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') { clearTimeout(t); resolve(true); }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(t); resolve(false); }
  });
});

if (!subscribed) {
  check('B can open a realtime channel', false, 'did not subscribe - is the table in the supabase_realtime publication?');
} else {
  // Touch one row of each dealer's, using the service role so both writes definitely happen.
  const { data: bRow } = await admin.from('vehicles').select('id, mileage_km').eq('owner_id', userB.id).limit(1).single();
  const { data: aRow } = await admin.from('vehicles').select('id, mileage_km').eq('owner_id', userA.id).limit(1).single();

  await admin.from('vehicles').update({ mileage_km: bRow.mileage_km + 1 }).eq('id', bRow.id);
  await admin.from('vehicles').update({ mileage_km: aRow.mileage_km + 1 }).eq('id', aRow.id);

  await new Promise((r) => setTimeout(r, 4000));

  check('B is told about its own rows', heard.own, heard.own ? 'received' : 'nothing arrived');

  // The negative check is only evidence if the positive one passed. Otherwise "no
  // leak" is indistinguishable from "the socket delivers nothing at all", and a test
  // that passes because the feature is broken is worse than no test.
  if (heard.own) {
    check("B is NOT told about A's rows", !heard.other, heard.other ? "A's change LEAKED over the socket" : 'nothing leaked');
  } else {
    console.log("SKIP  B is NOT told about A's rows — inconclusive while nothing is being delivered");
  }

  // put the mileage back
  await admin.from('vehicles').update({ mileage_km: bRow.mileage_km }).eq('id', bRow.id);
  await admin.from('vehicles').update({ mileage_km: aRow.mileage_km }).eq('id', aRow.id);
}

await asB.removeChannel(channel);

console.log(`\n${failures === 0 ? 'boundary holds: all checks passed' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
