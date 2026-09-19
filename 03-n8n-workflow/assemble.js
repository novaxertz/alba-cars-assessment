// Put the drafted brief on top of the computed digest.
//
// The model only ever writes the opening framing. Every figure below it was calculated
// in code, because a language model paraphrasing prices is a way to publish a number
// nobody can trace. If the call failed or came back empty, the digest goes out exactly
// as it would have without it - the brief is an improvement, not a dependency.

const digest = $('Build the digest').first().json;

const raw = $input.first().json ?? {};
const drafted = (raw.text ?? raw.output ?? raw.response ?? '').toString().trim();

// Guard against a model that ignores the instruction and returns an essay - and record
// WHY the brief was dropped, because "the brief just isn't there" is not something you
// can debug from a Discord message. The reason stays in the node output; it never goes
// into the message itself.
let reason = 'used';
if (raw.error) reason = `model call failed: ${raw.error.message ?? raw.error}`;
else if (!drafted) reason = 'model returned no text (check maxOutputTokens - a thinking model spends that budget on reasoning before it writes anything)';
else if (drafted.length <= 20) reason = `too short (${drafted.length} chars)`;
else if (drafted.length >= 600) reason = `too long (${drafted.length} chars)`;

const usable = reason === 'used' ? drafted : null;

const lines = digest.content.split('\n');
const content = usable
  ? [...lines.slice(0, 2), '', usable, ...lines.slice(2)].join('\n')
  : digest.content;

return [{ json: { content, briefUsed: Boolean(usable), briefReason: reason } }];
