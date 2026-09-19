// Put the drafted brief on top of the computed digest, and say which model wrote it.
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
else if (!drafted) reason = 'model returned no text';
else if (drafted.length <= 20) reason = `too short (${drafted.length} chars)`;
else if (drafted.length >= 600) reason = `too long (${drafted.length} chars)`;

const usable = reason === 'used' ? drafted : null;

/**
 * Attribution.
 *
 * Anything written by a model is labelled with the model that wrote it, so a reader can
 * tell at a glance which two sentences came from a machine and which figures came from
 * the database. Unattributed machine text in an operational report is how a paraphrase
 * ends up being quoted as a fact.
 *
 * Read from the connected model node rather than hard-coded, so swapping Gemini for
 * Claude or GPT relabels itself instead of lying. The node name is not knowable in
 * advance - each provider ships its own - so the usual ones are tried in turn and the
 * vendor is inferred from the model id, which is the part that actually identifies it.
 */
function connectedModel() {
  const candidates = [
    'Gemini', 'Google Gemini Chat Model', 'Google Vertex Chat Model',
    'OpenAI Chat Model', 'Azure OpenAI Chat Model',
    'Anthropic Chat Model', 'Claude', 'Groq Chat Model',
    'Mistral Cloud Chat Model', 'Ollama Chat Model', 'DeepSeek Chat Model',
  ];
  for (const name of candidates) {
    try {
      const params = $(name)?.params ?? {};
      const id = params.modelName ?? params.model?.value ?? params.model;
      if (id) return String(id).replace(/^models\//, '');
    } catch {
      // that node does not exist in this workflow - try the next
    }
  }
  return null;
}

function vendorOf(id) {
  const s = id.toLowerCase();
  if (s.includes('gemini') || s.includes('palm') || s.includes('bison')) return 'Google';
  if (s.includes('claude')) return 'Anthropic';
  if (/^(gpt|o\d)/.test(s) || s.includes('chatgpt')) return 'OpenAI';
  if (s.includes('llama')) return 'Meta';
  if (s.includes('mistral') || s.includes('mixtral')) return 'Mistral';
  if (s.includes('deepseek')) return 'DeepSeek';
  if (s.includes('qwen')) return 'Alibaba';
  if (s.includes('grok')) return 'xAI';
  return null;
}

let attribution = null;
if (usable) {
  const id = connectedModel();
  if (id) {
    const vendor = vendorOf(id);
    attribution = `-# Opening summary drafted by ${vendor ? `${vendor} ` : ''}${id}. Every figure below is computed from the database.`;
  } else {
    attribution = '-# Opening summary drafted by a language model. Every figure below is computed from the database.';
  }
}

const lines = digest.content.split('\n');
const content = usable
  ? [...lines.slice(0, 2), '', usable, attribution, ...lines.slice(2)].join('\n')
  : digest.content;

return [{ json: { content, briefUsed: Boolean(usable), briefReason: reason, model: connectedModel() } }];
