const out = { env: {}, adapters: {}, routes: {} };
for (const n of ['MUAPI_API_KEY','DASHSCOPE_API_KEY','MINIMAX_API_KEY','KLING_API_KEY','GENERATION_ASYNC','UPSTREAM_AI_BASE','PROVIDER_SECRETS_ENCRYPTION_KEY','ADMIN_SECRET_KEY']) {
  const v = process.env[n];
  out.env[n] = v === undefined ? null : (v === '' ? '<empty string>' : '<len ' + v.length + '>');
}
const { getProviderAdapter } = await import('@/lib/adapters/index.js');
for (const p of ['muapi','minimax','dashscope','alibaba','kling','google','openai']) {
  try {
    const a = await getProviderAdapter(p);
    out.adapters[p] = { class: a.constructor.name, hasApiKey: Boolean(a.apiKey), keyLength: a.apiKey ? a.apiKey.length : 0, baseUrl: a.baseUrl };
  } catch (e) { out.adapters[p] = { error: e.code || e.message }; }
}
const { routeGenerationTask } = await import('@/lib/services/smartRouter.js');
for (const m of ['nano-banana','minimax-hailuo-2.3-standard-t2v','imagen-4','hailuo-02']) {
  try {
    const d = await routeGenerationTask({ modelId: m });
    out.routes[m] = { selected: d.selectedProviderId, providerModel: d.selectedProviderModelId, score: d.finalScore, candidates: d.allCandidates.map((c) => c.providerId + '=' + c.totalScore) };
  } catch (e) { out.routes[m] = { errorCode: e.code || null, error: e.message }; }
}
const { getGenerationProvider } = await import('@/lib/services/generationProviders.js');
try {
  const p = await getGenerationProvider({ provider: 'google' });
  const res = await p.generate({ creation: { id: 'gen_probe', model: 'nano-banana', provider: 'google', input_summary_json: { prompt: 'probe', parameters: { prompt: 'probe' } } } });
  out.legacyProviderPath = { ok: true, res };
} catch (e) { out.legacyProviderPath = { code: e.code || null, message: e.message }; }
console.log(JSON.stringify(out, null, 1));
process.exit(0);
