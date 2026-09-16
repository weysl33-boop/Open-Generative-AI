import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/billing';
import { getDatabase, withTransaction, nowIso, randomId } from '@/lib/db';
import { findModelByEndpointOrId } from '@/lib/repositories/models';
import { updateUserCredits } from '@/lib/repositories/users';
import { insertCreditEntry } from '@/lib/repositories/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPSTREAM_BASE = process.env.UPSTREAM_AI_BASE || 'https://api.muapi.ai';

function cleanHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('cookie');
  return headers;
}

export async function GET(request, context) {
  const { path: pathSegments = [] } = await context.params;
  const subPath = pathSegments.join('/');
  const { search } = new URL(request.url);
  const targetUrl = `${UPSTREAM_BASE}/api/v1/${subPath}${search}`;

  const headers = cleanHeaders(request);
  const user = await getUserFromRequest(request);

  // 补齐平台 API Key（若客户端未传）
  if (!headers.get('x-api-key') && process.env.MUAPI_API_KEY) {
    headers.set('x-api-key', process.env.MUAPI_API_KEY);
  }

  try {
    const response = await fetch(targetUrl, { headers, method: 'GET' });
    const data = await response.json().catch(() => null);

    // 若轮询到任务成功，同步更新 creations 表
    if (data && (data.status === 'succeeded' || data.status === 'completed' || data.outputs || data.url)) {
      const requestId = data.request_id || data.id || pathSegments[1];
      const resultUrl = data.outputs?.[0] || data.url || data.output?.url;
      if (requestId && resultUrl) {
        try {
          const db = getDatabase();
          db.prepare(`
            UPDATE creations
            SET status = 'completed', result_url = ?, completed_at = ?
            WHERE external_request_id = ? OR id = ?
          `).run(resultUrl, nowIso(), requestId, requestId);
        } catch {}
      }
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[proxy/v1/GET]', error);
    return NextResponse.json({ error: error.message || '上游请求异常' }, { status: 502 });
  }
}

export async function POST(request, context) {
  const { path: pathSegments = [] } = await context.params;
  const subPath = pathSegments.join('/');
  const endpoint = pathSegments[0] || '';
  const { search } = new URL(request.url);
  const targetUrl = `${UPSTREAM_BASE}/api/v1/${subPath}${search}`;

  const user = await getUserFromRequest(request);

  // 1. 检查模型状态与定价
  const modelConfig = findModelByEndpointOrId(endpoint);
  if (modelConfig && modelConfig.is_active === 0) {
    return NextResponse.json(
      { error: `模型 [${modelConfig.name}] 当前正在维护升级中，已被管理员暂停调用，请切换其他模型。` },
      { status: 403 }
    );
  }

  const creditCost = modelConfig ? Number(modelConfig.credits_price || 1) : 1;
  let ledgerEntryId = null;
  let creationRecordId = null;

  // 2. 若用户已登录，进行额度预校验与原子扣减
  if (user) {
    if (user.status === 'suspended') {
      return NextResponse.json({ error: '账户已被封禁，无权发起生成' }, { status: 403 });
    }

    if (user.credits < creditCost) {
      return NextResponse.json(
        {
          error: `当前算力额度不足（剩余 ${user.credits}，本模型需消耗 ${creditCost}），请先充值或升级会员。`,
          code: 'INSUFFICIENT_CREDITS',
          currentCredits: user.credits,
          requiredCredits: creditCost,
        },
        { status: 402 }
      );
    }

    // 原子扣除额度并预建 creation 记录
    try {
      withTransaction((db) => {
        const nextCredits = user.credits - creditCost;
        updateUserCredits(db, user.id, nextCredits);

        ledgerEntryId = insertCreditEntry(db, {
          userId: user.id,
          delta: -creditCost,
          reason: `AI 生成消耗 - ${modelConfig?.name || endpoint}`,
          referenceId: null,
          metadata: { model: endpoint, provider: modelConfig?.provider || 'muapi' },
        });

        creationRecordId = randomId('gen');
        db.prepare(`
          INSERT INTO creations (id, user_id, studio_id, label, status, credit_cost, provider, model, created_at)
          VALUES (?, ?, ?, ?, 'processing', ?, ?, ?, ?)
        `).run(
          creationRecordId,
          user.id,
          modelConfig?.type || 'image',
          `调用 ${modelConfig?.name || endpoint}`,
          creditCost,
          modelConfig?.provider || 'muapi',
          endpoint,
          nowIso()
        );
      });
    } catch (deductErr) {
      console.error('[proxy/v1/deduct]', deductErr);
      return NextResponse.json({ error: '额度结算处理失败' }, { status: 500 });
    }
  }

  // 3. 读取请求体并转发上游
  let requestBody;
  let rawBodyText = '';
  try {
    rawBodyText = await request.text();
    requestBody = rawBodyText;
  } catch {
    requestBody = '';
  }

  const headers = cleanHeaders(request);
  if (!headers.get('content-type')) {
    headers.set('content-type', 'application/json');
  }

  // 确保有可用的 API Key
  const clientKey = request.headers.get('x-api-key');
  if (clientKey && clientKey !== 'koyosim-account-session') {
    headers.set('x-api-key', clientKey);
  } else if (process.env.MUAPI_API_KEY) {
    headers.set('x-api-key', process.env.MUAPI_API_KEY);
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: requestBody,
    });

    const data = await upstreamRes.json().catch(() => null);

    // 4. 上游调用失败：自动退款补偿
    if (!upstreamRes.ok || !data) {
      if (user && ledgerEntryId && creditCost > 0) {
        try {
          withTransaction((db) => {
            // 退还额度
            const current = db.prepare('SELECT credits FROM users WHERE id = ?').get(user.id);
            const refundedCredits = Number(current?.credits || 0) + creditCost;
            updateUserCredits(db, user.id, refundedCredits);

            insertCreditEntry(db, {
              userId: user.id,
              delta: creditCost,
              reason: `生成异常自动退还 - ${modelConfig?.name || endpoint}`,
              referenceId: creationRecordId,
              metadata: { error: data?.error || upstreamRes.statusText },
            });

            if (creationRecordId) {
              db.prepare(`
                UPDATE creations
                SET status = 'failed', error_code = ?, error_reason = ?
                WHERE id = ?
              `).run(String(upstreamRes.status), String(data?.error || upstreamRes.statusText).slice(0, 200), creationRecordId);
            }
          });
        } catch (refundErr) {
          console.error('[proxy/v1/auto-refund]', refundErr);
        }
      }

      return NextResponse.json(
        data || { error: `上游服务响应异常 (${upstreamRes.status})` },
        { status: upstreamRes.status }
      );
    }

    // 5. 上游成功，关联 external_request_id
    const requestId = data.request_id || data.id;
    if (creationRecordId && requestId) {
      try {
        const db = getDatabase();
        db.prepare(`
          UPDATE creations
          SET external_request_id = ?
          WHERE id = ?
        `).run(requestId, creationRecordId);
      } catch {}
    }

    return NextResponse.json(data, { status: upstreamRes.status });
  } catch (err) {
    console.error('[proxy/v1/POST/upstream]', err);

    // 发生网络层异常时，同样执行自动退款
    if (user && ledgerEntryId && creditCost > 0) {
      try {
        withTransaction((db) => {
          const current = db.prepare('SELECT credits FROM users WHERE id = ?').get(user.id);
          updateUserCredits(db, user.id, Number(current?.credits || 0) + creditCost);

          insertCreditEntry(db, {
            userId: user.id,
            delta: creditCost,
            reason: `网络异常自动退还 - ${modelConfig?.name || endpoint}`,
            referenceId: creationRecordId,
          });

          if (creationRecordId) {
            db.prepare(`
              UPDATE creations
              SET status = 'failed', error_code = 'NETWORK_ERROR', error_reason = ?
              WHERE id = ?
            `).run(err.message.slice(0, 200), creationRecordId);
          }
        });
      } catch {}
    }

    return NextResponse.json({ error: `调用上游服务网络超时: ${err.message}` }, { status: 504 });
  }
}
