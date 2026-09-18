import { NextResponse } from 'next/server';
import { cached } from '@/lib/cache';
import { decodeVin, fetchComplaints, normaliseVin, UpstreamError, VinDecodeError } from '@/lib/nhtsa';

/**
 * Paged reader over the complaint set.
 *
 * The analysis endpoint answers "what breaks on this car". This one answers the
 * question that follows: "show me what people actually wrote". For a 2016 Ford Explorer
 * that is 2,448 records and roughly 2.4MB of JSON from NHTSA.
 *
 * The browser never receives that. The full set is already in the server cache from the
 * analysis call, so paging it here costs no extra upstream requests — a page is a slice
 * of memory, not a fetch. That is the argument for having a backend at all, made
 * concrete: the client asks for thirty rows and gets thirty rows.
 */

const DECODE_TTL = 30 * 24 * 60 * 60 * 1000;
const COMPLAINT_TTL = 12 * 60 * 60 * 1000;
const PAGE = 30;
const MAX_PAGE = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const parsed = normaliseVin(params.get('vin') ?? '');
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const limit = Math.min(MAX_PAGE, Math.max(1, Number(params.get('limit')) || PAGE));
  const component = (params.get('component') ?? '').trim().toUpperCase();
  const harmOnly = params.get('harm') === '1';

  try {
    const decode = await cached(`vin:${parsed.vin}`, DECODE_TTL, () => decodeVin(parsed.vin));
    const v = decode.value;

    const all = await cached(
      `complaints:recalls:${v.make}|${v.model}|${v.modelYear}`.toLowerCase(),
      COMPLAINT_TTL,
      () => fetchComplaints(v.make, v.model, v.modelYear),
    );

    let rows = all.value;
    if (component) rows = rows.filter((c) => (c.components || '').toUpperCase().startsWith(component));
    if (harmOnly) rows = rows.filter((c) => c.crash || c.fire || c.injuries > 0 || c.deaths > 0);

    // Newest first: an owner's report from last year says more about a car you are
    // buying today than one from 2009.
    const sorted = [...rows].sort((a, b) => {
      const parse = (s: string) => {
        const [m, d, y] = (s || '').split('/').map(Number);
        return y ? new Date(y, (m || 1) - 1, d || 1).getTime() : 0;
      };
      return parse(b.dateComplaintFiled) - parse(a.dateComplaintFiled);
    });

    const slice = sorted.slice(offset, offset + limit).map((c) => ({
      id: c.odiNumber,
      component: c.components,
      filed: c.dateComplaintFiled,
      summary: c.summary,
      crash: c.crash,
      fire: c.fire,
      injuries: c.injuries,
      deaths: c.deaths,
    }));

    return NextResponse.json(
      {
        total: sorted.length,
        offset,
        limit,
        rows: slice,
        hasMore: offset + limit < sorted.length,
        vehicle: `${v.modelYear} ${v.make} ${v.model}`.trim(),
      },
      { headers: { 'cache-control': 'private, max-age=60' } },
    );
  } catch (error) {
    if (error instanceof VinDecodeError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof UpstreamError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Something failed on our side.' }, { status: 500 });
  }
}
