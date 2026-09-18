// Builds the nightly digest and counts what the idempotency guard did.
//
// PostgREST with on_conflict + Prefer: resolution=ignore-duplicates returns the rows it
// inserted and omits the ones that collided with the unique constraint - so "written"
// versus "already recorded" falls straight out of the response.
//
// Formatting is Discord-native: headings, a monospace block per severity band so the
// figures line up, and small subtext for the caveats. A pricing review is skimmed on a
// phone, so the shape has to carry the meaning before the words do.

const everything = $('Score the markdown').all().map((i) => i.json);

// Cars held back by a "do not drive" recall never reach the markdown table - they are
// alerted on their own path - so they must not be counted as "skipped" here.
const blocked = everything.filter((s) => s.priority === 'blocked');
const scored = everything.filter((s) => s.priority !== 'blocked');

const written = $input
  .all()
  .flatMap((i) => (Array.isArray(i.json) ? i.json : [i.json]))
  .filter((r) => r && r.id);

const writtenIds = new Set(written.map((r) => r.vehicle_id));
const skipped = scored.filter((s) => !writtenIds.has(s.vehicle_id));

const n = (v) => Number(v).toLocaleString('en-AE');
const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// Fixed-width rows inside a code block: the columns align, which is what makes a list
// of numbers skimmable rather than a wall of text.
const row = (s) => {
  // The model year is dropped here: it is on the dashboard, and keeping it truncated
  // "Porsche 718 Caym" mid-word, which looks broken. Without it the longest name on the
  // lot (Land Rover Range Rover) fits exactly.
  const name = s.label.replace(/^\d{4}\s+/, '');
  return (
    `${name.slice(0, 22).padEnd(22)} ${String(s.days_on_lot).padStart(3)}d  ` +
    `${n(s.current_price_aed).padStart(7)} → ${n(s.recommended_price_aed).padStart(7)}  ` +
    `${('−' + n(s.cut_aed)).padStart(7)}`
  );
};

const band = (title, items) =>
  items.length ? [`### ${title} (${items.length})`, '```', ...items.map(row), '```'] : [];

const urgent = scored.filter((s) => s.severity === 'urgent');
const act = scored.filter((s) => s.severity === 'act');
const watch = scored.filter((s) => s.severity === 'watch');
const totalCut = scored.reduce((sum, s) => sum + s.cut_aed, 0);

const parts = [`## Nightly markdown review`, `**${date}**`, ''];

parts.push(
  `**${scored.length + blocked.length}** vehicles past 30 days  ·  ` +
  `**${written.length}** new recommendation${written.length === 1 ? '' : 's'}  ·  ` +
  `**${skipped.length}** already recorded today`,
);

if (blocked.length) {
  parts.push(
    `> ⚠️ **${blocked.length}** vehicle${blocked.length === 1 ? '' : 's'} held back for open ` +
    `"do not drive" recalls — posted separately.`,
  );
}

parts.push('');
parts.push(...band('Over 90 days — act now', urgent));
parts.push(...band('60 to 89 days', act));
parts.push(...band('Watch list — 30 to 59 days', watch));

parts.push(`**Total proposed reduction: AED ${n(totalCut)}**`);
parts.push('-# Nothing has been applied. These are recommendations for a human to approve.');

const unknown = scored.filter((s) => !s.recall_known).length;
if (unknown) {
  parts.push(`-# Recall status unavailable for ${unknown} vehicle${unknown === 1 ? '' : 's'} — treated as unknown, not clear.`);
}

let content = parts.join('\n');

// Discord rejects anything over 2000 characters with a 400, which would lose the whole
// digest rather than the tail of it. Trim to the last complete line that fits, and close
// any code block the trim may have cut open.
const LIMIT = 1900;
if (content.length > LIMIT) {
  let kept = content.slice(0, LIMIT).split('\n').slice(0, -1).join('\n');
  if ((kept.match(/```/g) || []).length % 2 === 1) kept += '\n```';
  content = `${kept}\n-# …truncated. ${scored.length} vehicles in full — see the dashboard.`;
}

return [{ json: { content, written: written.length, skipped: skipped.length } }];
