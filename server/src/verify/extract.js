// AI document reading with Claude: photo or PDF in, structured fields + per-field confidence out.
// Uses a forced tool call so the response is always valid JSON matching the schema.
const MODEL = process.env.EXTRACT_MODEL || 'claude-sonnet-5-5';

export const FIELD_SCHEMAS = {
  medical: { name: 'Full name of airman', class: 'First/Second/Third class or BasicMed', examDate: 'Date of examination (YYYY-MM-DD)', expires: 'Date the medical stops being valid for the pilot’s privileges (YYYY-MM-DD) if printed, else empty', limitations: 'Limitations text or "None"' },
  renterIns: { insured: 'Named insured', carrier: 'Insurance company', policy: 'Policy number', liability: 'Liability limit in USD', damage: 'Non-owned aircraft physical damage limit in USD', expires: 'Policy expiration date (YYYY-MM-DD)' },
  cfiIns: { insured: 'Named insured', carrier: 'Insurance company', policy: 'Policy number', liability: 'Liability limit in USD', expires: 'Policy expiration date (YYYY-MM-DD)' },
  ownerIns: { insured: 'Named insured', tail: 'Aircraft N-number(s) covered', carrier: 'Insurance company', policy: 'Policy number', use: 'Approved use / purpose of use', liability: 'Liability limit in USD', additional: 'Additional insureds listed', broker: 'Agent/broker email address', expires: 'Policy expiration date (YYYY-MM-DD)' },
  airworthiness: { tail: 'Registration mark (N-number)', serial: 'Aircraft serial number', category: 'Category' },
  annual: { date: 'Date of annual inspection (YYYY-MM-DD)', hobbs: 'Hobbs or total time at inspection', tach: 'Tach time if shown', signer: 'Name of signing mechanic', certNo: 'Mechanic certificate number', ia: 'IA number if shown' },
  hundredHr: { date: 'Date of 100-hour inspection (YYYY-MM-DD)', hobbs: 'Hobbs or total time at inspection', signer: 'Name of signing mechanic', certNo: 'Mechanic certificate number' },
  iaCard: { name: 'Name on Inspection Authorization', expires: 'Expiration if printed (YYYY-MM-DD)' },
  pilotCertPhoto: { name: 'Name', level: 'Certificate level', ratings: 'Ratings listed' },
};

export async function extractDocument({ type, base64, mediaType }, { client } = {}) {
  const schema = FIELD_SCHEMAS[type];
  if (!schema) throw new Error(`No extraction schema for ${type}`);
  if (!client) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic(); // reads ANTHROPIC_API_KEY
  }
  const properties = Object.fromEntries(
    Object.entries(schema).map(([k, desc]) => [k, { type: 'object', description: desc, properties: { value: { type: 'string' }, confidence: { type: 'number', description: '0-1, how sure you are this was read correctly' } }, required: ['value', 'confidence'] }])
  );
  const file = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [{
      name: 'record_document',
      description: 'Record the fields read from the aviation document.',
      input_schema: {
        type: 'object',
        properties: { ...properties, is_expected_document: { type: 'boolean', description: `True if this is a ${type} document` }, legible: { type: 'boolean' } },
        required: [...Object.keys(schema), 'is_expected_document', 'legible'],
      },
    }],
    tool_choice: { type: 'tool', name: 'record_document' },
    messages: [{
      role: 'user',
      content: [file, { type: 'text', text: `Read this ${type} document for an aviation marketplace's verification. Copy values exactly as printed; use an empty value with low confidence when a field is missing or unreadable. Do not guess.` }],
    }],
  });
  const out = res.content.find((b) => b.type === 'tool_use')?.input || {};
  const fields = {};
  let confidence = 1;
  for (const k of Object.keys(schema)) {
    fields[k] = out[k]?.value ?? '';
    confidence = Math.min(confidence, out[k]?.value ? out[k]?.confidence ?? 0.5 : 1);
  }
  if (!out.is_expected_document || !out.legible) confidence = Math.min(confidence, 0.4);
  return { fields, confidence, wrongDocument: out.is_expected_document === false };
}
