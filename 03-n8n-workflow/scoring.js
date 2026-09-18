// Extracted from the Code node in the workflow, kept here so it is reviewable as code
// rather than as a string inside JSON. Paste-identical to the node body.

const RATE = { watch: 0.03, act: 0.06, urgent: 0.10 };

function bucket(days) {
  if (days >= 90) return 'urgent';
  if (days >= 60) return 'act';
  return 'watch';
}

// Round to the nearest 500 AED. Nobody lists a car at 47,312.
const round500 = (n) => Math.max(500, Math.round(n / 500) * 500);

const out = [];

for (const item of $input.all()) {
  const v = item.json;

  const days = Number(v.days_on_lot);
  const current = Number(v.list_price_aed);
  const cost = Number(v.acquisition_cost_aed);
  const holding = Number(v.holding_cost_aed);
  const margin = Number(v.margin_at_list_aed);

  const severity = bucket(days);
  let cut = RATE[severity];

  // Already under water: cutting further only deepens the loss, so recommend the
  // smallest move that might actually shift it rather than a percentage of a price
  // that is no longer the problem.
  const underwater = margin < 0;
  if (underwater) cut = Math.min(cut, 0.04);

  const recommended = round500(current * (1 - cut));

  // The recall check is a second source and is allowed to fail — see the workflow's
  // error handling. Absent data must never read as "no recalls".
  //
  // The Merge node hands over task 01's raw API response, so the recall list arrives as
  // `recalls`, an array. An earlier version of this code expected a pre-summarised
  // `recall` object, which silently made every car read as "unknown" and meant the
  // do-not-retail branch never fired. Both shapes are accepted now, and anything else
  // is treated as unknown rather than clear.
  let recallKnown = false;
  let parkIt = 0;
  let openCampaigns = null;

  if (Array.isArray(v.recalls)) {
    recallKnown = true;
    openCampaigns = v.recalls.length;
    parkIt = v.recalls.filter((r) => r && (r.parkIt === true || r.parkIt === 'true')).length;
  } else if (v.recall && v.recall.ok === true) {
    recallKnown = true;
    openCampaigns = v.recall.campaigns ?? null;
    parkIt = v.recall.parkIt ?? 0;
  }

  const reasons = [];
  reasons.push(`${days} days on the lot, ${holding.toLocaleString()} AED of carrying cost so far`);
  if (underwater) reasons.push(`asking price no longer covers cost plus carry (margin ${margin.toLocaleString()} AED)`);
  else reasons.push(`margin at list ${margin.toLocaleString()} AED`);

  if (parkIt > 0) reasons.push(`${parkIt} "do not drive" recall${parkIt === 1 ? '' : 's'} open — do not retail until repaired`);
  else if (openCampaigns) reasons.push(`${openCampaigns} open recall campaign${openCampaigns === 1 ? '' : 's'}`);
  else if (!recallKnown) reasons.push('recall status unavailable, not confirmed clear');

  out.push({
    json: {
      vehicle_id: v.id,
      owner_id: v.owner_id,
      vin: v.vin,
      label: `${v.year ?? ''} ${v.make} ${v.model}`.trim(),
      days_on_lot: days,
      holding_cost_aed: Math.round(holding),
      current_price_aed: current,
      recommended_price_aed: recommended,
      cut_aed: current - recommended,
      severity,
      // parkIt outranks ageing: a car that should not be driven is not a pricing problem
      priority: parkIt > 0 ? 'blocked' : severity,
      rationale: reasons.join('. ') + '.',
      recall_known: Boolean(recallKnown),
      park_it: parkIt,
      open_campaigns: openCampaigns,
      cost_aed: cost,
    },
  });
}

return out;
