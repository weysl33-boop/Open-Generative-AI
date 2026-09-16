import { execute, nowIso, queryOne } from '../db/index.js';

const UPSTREAM_BASE = process.env.UPSTREAM_AI_BASE || 'https://api.muapi.ai';

async function failCreation(id, code, reason) {
  await execute(`UPDATE creations SET status = 'failed', error_code = $1, error_reason = $2, completed_at = $3, updated_at = $3 WHERE id = $4`, [code, String(reason).slice(0, 200), nowIso(), id]);
}

export async function executePendingCreation(creationId) {
  const creation = await queryOne('SELECT * FROM creations WHERE id = $1', [creationId]);
  if (!creation) return { error: '未找到对应任务' };
  let metadata = {};
  try { metadata = creation.metadata_json && typeof creation.metadata_json === 'object' ? creation.metadata_json : JSON.parse(creation.metadata_json || '{}'); } catch {}
  const endpoint = creation.model || 'nano-banana-pro';
  const apiKey = process.env.MUAPI_API_KEY || '';
  if (!apiKey) { await failCreation(creationId, 'CONFIG_MISSING', '系统未配置 MUAPI_API_KEY 平台密钥，无法执行重试'); return { error: '未配置服务商密钥' }; }
  await execute("UPDATE creations SET status = 'processing', started_at = $1, updated_at = $1 WHERE id = $2", [nowIso(), creationId]);
  const payload = { prompt: metadata.prompt || creation.label || 'High quality cinematic artwork', aspect_ratio: metadata.aspect_ratio || '1:1', resolution: metadata.resolution || '1024x1024', ...metadata.parameters };
  try {
    const res = await fetch(`${UPSTREAM_BASE}/api/v1/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) { await failCreation(creationId, String(res.status), data?.error || res.statusText); return { success: false, error: data?.error || res.statusText }; }
    const requestId = data.request_id || data.id;
    if (requestId) await execute('UPDATE creations SET external_request_id = $1, updated_at = $2 WHERE id = $3', [requestId, nowIso(), creationId]);
    const directUrl = data.outputs?.[0] || data.url || data.output?.url;
    if (directUrl) { await execute("UPDATE creations SET status = 'completed', result_url = $1, completed_at = $2, updated_at = $2 WHERE id = $3", [directUrl, nowIso(), creationId]); return { success: true, resultUrl: directUrl }; }
    if (requestId) {
      (async () => {
        for (let attempts = 0; attempts < 30; attempts += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
          try {
            const pollRes = await fetch(`${UPSTREAM_BASE}/api/v1/predictions/${requestId}/result`, { headers: { 'x-api-key': apiKey } });
            const pollData = await pollRes.json();
            const outputUrl = pollData?.outputs?.[0] || pollData?.url || pollData?.output?.url;
            if (outputUrl) { await execute("UPDATE creations SET status = 'completed', result_url = $1, completed_at = $2, updated_at = $2 WHERE id = $3", [outputUrl, nowIso(), creationId]); break; }
            if (pollData?.status === 'failed') { await failCreation(creationId, 'UPSTREAM_FAILED', pollData?.error || '生成失败'); break; }
          } catch {}
        }
      })().catch(() => {});
    }
    return { success: true, requestId };
  } catch (error) {
    await failCreation(creationId, 'NETWORK_ERROR', error.message);
    return { success: false, error: error.message };
  }
}
