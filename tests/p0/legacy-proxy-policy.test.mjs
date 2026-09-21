import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  authorizeScopedProxyPath,
  classifyProxyRequest,
  isCreativeAgentInferenceRequest,
  isLocalCreationId,
  isPredictionPoll,
  POLICY,
  PROXY_SCOPE,
} from '../../lib/security/legacyProxyPolicy.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (relativePath) => fs.readFile(path.join(repoRoot, relativePath), 'utf8');

const knownGenerationEndpoint = (slug) => slug === 'nano-banana-pro';

test('legacy proxy never exposes platform-account surfaces', async () => {
  const blocked = [
    ['account', 'GET'],
    ['account', 'balance', 'GET'],
    ['history', 'GET'],
    ['wallet', 'GET'],
    ['billing', 'invoices', 'GET'],
    ['usage', 'GET'],
    ['keys', 'GET'],
    ['secrets', 'GET'],
    ['admin', 'users', 'GET'],
    ['account', 'update', 'POST'],
  ];
  for (const entry of blocked) {
    const method = entry.pop();
    const verdict = classifyProxyRequest(entry, method);
    assert.equal(verdict.allow, false, `${method} ${entry.join('/')} must be denied`);
    assert.equal(verdict.decision, POLICY.DENY_ACCOUNT);
  }
});

test('legacy proxy defaults to deny for unknown upstream paths', () => {
  assert.equal(classifyProxyRequest([], 'GET').allow, false);
  assert.equal(classifyProxyRequest(['whatever', 'nested'], 'GET').decision, POLICY.DENY_PATH);
  assert.equal(classifyProxyRequest(['predictions', 'provider_req_123', 'result'], 'GET').allow, false);
  assert.equal(classifyProxyRequest(['predictions', 'abc', 'result', 'extra'], 'GET').allow, false);
  assert.equal(classifyProxyRequest(['DELETE', 'me'], 'DELETE').allow, false);
});

test('legacy proxy keeps only non-generative studio utility paths', () => {
  const poll = classifyProxyRequest(['predictions', 'req_123', 'result'], 'GET');
  assert.equal(poll.allow, false);
  assert.equal(poll.decision, POLICY.DENY_PATH);

  const estimate = classifyProxyRequest(['models', 'nano-banana-pro', 'estimate-cost'], 'GET');
  assert.equal(estimate.allow, true);
  assert.equal(estimate.decision, POLICY.ALLOW_ESTIMATE);

  const upload = classifyProxyRequest(['upload_file'], 'POST');
  assert.equal(upload.allow, true);
  assert.equal(upload.decision, POLICY.ALLOW_UTILITY);

  const pricing = classifyProxyRequest(['app', 'calculate_dynamic_cost'], 'POST');
  assert.equal(pricing.allow, true);
  assert.equal(pricing.decision, POLICY.ALLOW_UTILITY);

  const generate = classifyProxyRequest(['nano-banana-pro'], 'POST', { isKnownGenerationEndpoint: knownGenerationEndpoint });
  assert.equal(generate.allow, false);
  assert.equal(generate.decision, 'DENY_BILLING_REQUIRED');
});

test('legacy proxy only accepts generation endpoints present in the catalog', () => {
  const unknown = classifyProxyRequest(['not-a-real-model'], 'POST', { isKnownGenerationEndpoint: knownGenerationEndpoint });
  assert.equal(unknown.allow, false);
  assert.equal(unknown.decision, POLICY.DENY_PATH);

  // 没有目录判定能力时（例如调用方忘记注入依赖）必须拒绝，而不是放行。
  const noDeps = classifyProxyRequest(['nano-banana-pro'], 'POST');
  assert.equal(noDeps.allow, false);

  // 多段路径不得被当作生成端点。
  const nested = classifyProxyRequest(['nano-banana-pro', 'extra'], 'POST', {
    isKnownGenerationEndpoint: () => true,
  });
  assert.equal(nested.allow, false);
});

test('local creation ids are recognised so polling stays ownership-checked', () => {
  assert.equal(isLocalCreationId('gen_abc123'), true);
  assert.equal(isLocalCreationId('provider_request_9'), false);
  assert.equal(isLocalCreationId(null), false);
  assert.equal(isPredictionPoll(['predictions', 'gen_abc', 'result']), true);
  assert.equal(isPredictionPoll(['predictions', 'gen_abc', 'media']), false);
});

test('legacy proxy signs with the managed server key and strips client credentials', async () => {
  const route = await source('app/api/api/v1/[[...path]]/route.js');
  assert.match(route, /getUserFromRequest/);
  assert.match(route, /findCreationById/);
  assert.match(route, /getServerProviderApiKey/);
  assert.match(route, /headers\.delete\('x-api-key'\)/);
  assert.match(route, /headers\.set\('x-api-key', apiKey\)/);
  assert.doesNotMatch(route, /getApiKey\(request\)/);
  assert.doesNotMatch(route, /getApiKeyFromRequest/);
  // 生成路径必须有限流与内容审核，否则等于绕过统一生成接口的全部防护。
  assert.match(route, /consumeRateLimit/);
  assert.match(route, /validatePromptSafety/);
});

test('agents / app / workflow proxies default to deny', () => {
  // 这三个代理此前把任意上游路径用平台密钥签名转发。
  for (const scope of [PROXY_SCOPE.AGENTS, PROXY_SCOPE.APP, PROXY_SCOPE.WORKFLOW]) {
    assert.equal(authorizeScopedProxyPath(scope, ['account', 'balance'], 'GET').allow, false, scope);
    assert.equal(authorizeScopedProxyPath(scope, ['../../etc/passwd'], 'GET').allow, false, scope);
    assert.equal(authorizeScopedProxyPath(scope, ['totally', 'unknown', 'path'], 'POST').allow, false, scope);
  }
  assert.equal(authorizeScopedProxyPath('nope', ['anything'], 'GET').allow, false);
});

test('agents proxy still serves every path the shipped agent UI calls', () => {
  const allowed = [
    ['GET', []],
    ['GET', ['skills']],
    ['GET', ['templates', 'agents']],
    ['GET', ['user', 'agents']],
    ['GET', ['user', 'conversations']],
    ['GET', ['by-slug', 'my-agent']],
    ['PUT', ['by-slug', 'my-agent']],
    ['DELETE', ['by-slug', 'my-agent']],
    ['GET', ['by-slug', 'my-agent', 'conv_1']],
    ['POST', ['by-slug', 'my-agent', 'like']],
    ['GET', ['agent_1', 'profile']],
  ];
  for (const [method, segments] of allowed) {
    assert.equal(
      authorizeScopedProxyPath(PROXY_SCOPE.AGENTS, segments, method).allow,
      true,
      `${method} /${segments.join('/')} should be allowed`,
    );
  }

  // 会话读取是 GET；动作段不能被通配吃掉，未知段必须拒绝。
  assert.equal(authorizeScopedProxyPath(PROXY_SCOPE.AGENTS, ['by-slug', 'a', 'chat'], 'GET').allow, false);
  assert.equal(authorizeScopedProxyPath(PROXY_SCOPE.AGENTS, ['by-slug', 'a', 'chat'], 'POST').allow, false);
  assert.equal(authorizeScopedProxyPath(PROXY_SCOPE.AGENTS, ['my-agent'], 'GET').allow, false);
  assert.equal(authorizeScopedProxyPath(PROXY_SCOPE.AGENTS, ['user', 'settings'], 'GET').allow, false);
});

test('unmetered agent and workflow inference calls fail closed', () => {
  for (const path of [
    [],
    ['suggest'],
    ['by-slug', 'a', 'chat'],
    ['by-slug', 'a', 'preview-realign'],
  ]) {
    const agentCall = authorizeScopedProxyPath(PROXY_SCOPE.AGENTS, path, 'POST');
    assert.equal(agentCall.allow, false, `POST /${path.join('/')} must not consume platform provider credits for free`);
    assert.equal(agentCall.decision, 'DENY_BILLING_REQUIRED');
  }

  for (const path of [
    ['wf_1', 'node', 'n_1', 'run'],
    ['wf_1', 'api-execute'],
    ['architect'],
    ['create'],
  ]) {
    const workflowCall = authorizeScopedProxyPath(PROXY_SCOPE.WORKFLOW, path, 'POST');
    assert.equal(workflowCall.allow, false, `POST /${path.join('/')} must not execute unmetered workflow inference`);
    assert.equal(workflowCall.decision, 'DENY_BILLING_REQUIRED');
  }

  const listDefs = authorizeScopedProxyPath(PROXY_SCOPE.WORKFLOW, ['get-workflow-defs'], 'GET');
  assert.equal(listDefs.allow, true);
  assert.equal(listDefs.billed, false);

  const upload = authorizeScopedProxyPath(PROXY_SCOPE.APP, ['get_file_upload_url'], 'GET');
  assert.equal(upload.allow, true);
  assert.equal(upload.billed, false);
});

test('workflow proxy still serves the shipped workflow builder', () => {
  const allowed = [
    ['GET', ['get-workflow-defs']],
    ['GET', ['get-workflow-def', 'wf_1']],
    ['GET', ['get-template-workflows']],
    ['GET', ['get-published-workflows']],
    ['GET', ['wf_1', 'node-schemas']],
    ['GET', ['wf_1', 'api-node-schemas']],
    ['GET', ['wf_1', 'api-inputs']],
    ['GET', ['run', 'run_1', 'status']],
    ['GET', ['run', 'run_1', 'api-outputs']],
    ['GET', ['poll-architect', 'req_1', 'result']],
    ['POST', ['cloudfront-signed-url']],
    ['POST', ['update-name', 'wf_1']],
    ['POST', ['workflow', 'wf_1', 'publish']],
    ['DELETE', ['delete-workflow-def', 'wf_1']],
    ['DELETE', ['node-run', 'nr_1']],
  ];
  for (const [method, segments] of allowed) {
    assert.equal(
      authorizeScopedProxyPath(PROXY_SCOPE.WORKFLOW, segments, method).allow,
      true,
      `${method} /${segments.join('/')} should be allowed`,
    );
  }
});

test('workflow model execution is not proxied until it reserves platform credits', () => {
  for (const [method, path] of [
    ['POST', ['wf_1', 'api-execute']],
    ['POST', ['wf_1', 'node', 'n_1', 'run']],
    ['POST', ['wf_1', 'run']],
  ]) {
    const verdict = authorizeScopedProxyPath(PROXY_SCOPE.WORKFLOW, path, method);
    assert.equal(verdict.allow, false, `${method} /${path.join('/')} must not consume platform provider credits for free`);
    assert.equal(verdict.decision, 'DENY_BILLING_REQUIRED');
  }
});

test('Creative Agent image/video execution is identified as provider-billed work', () => {
  assert.equal(isCreativeAgentInferenceRequest(['sessions', 's1', 'chat'], 'POST'), true);
  assert.equal(isCreativeAgentInferenceRequest(['sessions', 's1', 'run-skill'], 'POST'), true);
  assert.equal(isCreativeAgentInferenceRequest(['jobs', 'j1', 'approve'], 'POST'), true);
  assert.equal(isCreativeAgentInferenceRequest(['jobs', 'j1', 'cancel'], 'POST'), false);
  assert.equal(isCreativeAgentInferenceRequest(['sessions', 's1', 'assets'], 'POST'), false);
  assert.equal(isCreativeAgentInferenceRequest(['sessions', 's1', 'chat'], 'GET'), false);
});

test('the three naked upstream proxies now run through the shared guard', async () => {
  for (const file of [
    'app/api/agents/[[...path]]/route.js',
    'app/api/app/[[...path]]/route.js',
    'app/api/workflow/[[...path]]/route.js',
    'app/api/v1/[[...path]]/route.js',
    'app/api/v1/creative-agent/[[...path]]/route.js',
  ]) {
    const route = await source(file);
    assert.match(route, /guardScopedProxyRequest|classifyProxyRequest|isCreativeAgentInferenceRequest/, `${file} must gate upstream paths`);
    assert.match(route, /headers\.delete\('cookie'\)/, `${file} must not forward browser cookies upstream`);
  }
});

test('billable legacy inference responses instruct callers to use metered generation', async () => {
  const route = await source('app/api/api/v1/[[...path]]/route.js');
  const scopedGuard = await source('lib/security/scopedProxyGuard.js');
  assert.match(route, /POLICY\.DENY_BILLING_REQUIRED[\s\S]*?402/);
  assert.match(scopedGuard, /POLICY\.DENY_BILLING_REQUIRED\s*\?\s*402/);
});
