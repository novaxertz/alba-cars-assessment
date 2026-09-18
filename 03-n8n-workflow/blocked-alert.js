// The "do not retail" path. These cars are not a pricing problem, so they never reach
// the markdown table - they get their own message, immediately, and it leads with the
// instruction rather than with the data.

const cars = $input.all().map((i) => i.json);
if (cars.length === 0) return [];

const n = (v) => Number(v).toLocaleString('en-AE');

// ASCII only, and one subtext line rather than two - see digest.js for why.
const parts = [
  '## Do not retail',
  `**${cars.length}** vehicle${cars.length === 1 ? '' : 's'} on the lot ` +
  `${cars.length === 1 ? 'has' : 'have'} an open **"do not drive"** recall. ` +
  `Close the recall before ${cars.length === 1 ? 'it goes' : 'they go'} on sale - no markdown recommended.`,
  '',
];

for (const c of cars) {
  parts.push(`### ${c.label}`);
  parts.push('```');
  parts.push(`VIN            ${c.vin}`);
  parts.push(`Recalls        ${c.park_it} "do not drive"${c.open_campaigns ? ` of ${c.open_campaigns} open campaigns` : ''}`);
  parts.push(`Days on lot    ${c.days_on_lot}`);
  parts.push(`Asking         AED ${n(c.current_price_aed)}`);
  parts.push('```');
}

parts.push(
  '-# Recall data from NHTSA, matched by make, model and year rather than by VIN.  |  ' +
  'Confirm with the manufacturer whether this specific car has already been repaired.',
);

return [{ json: { content: parts.join('\n') } }];
