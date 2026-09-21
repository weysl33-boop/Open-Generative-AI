import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createMockGenerationProvider } from '../../lib/services/generationProviders.js';
import { assertGenerationTransition, canTransitionGeneration } from '../../lib/services/generationState.js';

test('generation state machine only permits the core lifecycle', () => {
  assert.equal(canTransitionGeneration('queued', 'processing'), true);
  assert.equal(canTransitionGeneration('processing', 'succeeded'), true);
  assert.equal(canTransitionGeneration('processing', 'failed'), true);
  assert.equal(canTransitionGeneration('succeeded', 'processing'), false);
  assert.throws(() => assertGenerationTransition('succeeded', 'processing'), { code: 'INVALID_GENERATION_TRANSITION' });
});

test('mock provider exposes deterministic success and failure seams', async () => {
  const creation = { id: 'gen_test', model: 'mock-image' };
  const success = await createMockGenerationProvider({ resultUrl: 'https://mock.invalid/result.png' }).generate({ creation });
  assert.equal(success.resultUrl, 'https://mock.invalid/result.png');
  assert.match(success.providerRequestId, /^mock_/);

  await assert.rejects(
    () => createMockGenerationProvider({ outcome: 'failed' }).generate({ creation }),
    { code: 'MOCK_PROVIDER_FAILED' },
  );
});

test('generation create and settlement keep credits, task state, events, and audit in transaction boundaries', () => {
  const core = fs.readFileSync(new URL('../../lib/services/generationCore.js', import.meta.url), 'utf8');
  const credits = fs.readFileSync(new URL('../../lib/financial/creditService.js', import.meta.url), 'utf8');
  const repositories = fs.readFileSync(new URL('../../lib/repositories/creations.js', import.meta.url), 'utf8');

  assert.match(core, /return withTransaction\(async \(tx\) => \{/);
  assert.match(core, /commitCredits\(\{[\s\S]*?transaction: tx/);
  assert.match(core, /voidCredits\(\{[\s\S]*?transaction: tx/);
  assert.match(core, /logAudit\(\{[\s\S]*?transaction: tx/);
  assert.match(core, /claimQueuedGeneration\(creationId, tx\)/);
  assert.match(credits, /commitCredits\(\{[^}]*transaction = null/);
  assert.match(credits, /voidCredits\(\{[^}]*transaction = null/);
  assert.match(repositories, /claimQueuedGeneration\(creationId, transaction = null\)/);
  assert.match(repositories, /updateGenerationOutcome\(creationId, \{[\s\S]*?transaction = null/);
});

test('legacy billing creation writes cannot bypass the generation service', async () => {
  const billing = await import('../../lib/billing.js');
  await assert.rejects(
    () => billing.recordCreation({ userId: 'legacy', studioId: 'studio' }),
    (error) => error.code === 'LEGACY_CREATION_WRITE_DISABLED' && error.status === 410,
  );
});

test('account creation and session event writes use PostgreSQL transaction boundaries', async () => {
  const authServiceSource = fs.readFileSync(new URL('../../lib/services/auth.js', import.meta.url), 'utf8');
  const authSource = fs.readFileSync(new URL('../../lib/repositories/auth.js', import.meta.url), 'utf8');
  assert.match(authServiceSource, /export async function createUser[\s\S]*?return withTransaction\(async \(tx\) => \{/);
  assert.match(authServiceSource, /export async function findOrCreateUserByPhone[\s\S]*?return withTransaction\(async \(tx\) => \{/);
  assert.match(authServiceSource, /export async function createOAuthUser[\s\S]*?return withTransaction\(async \(tx\) => \{/);
  assert.match(authServiceSource, /export async function createSession[\s\S]*?recordAuthEvent\(\{[\s\S]*?transaction: tx/);
  assert.match(authSource, /recordAuthEvent\(\{[\s\S]*?transaction = null/);
});

test('financial wallet mutations lock the balance snapshot before calculating a new balance', () => {
  const currency = fs.readFileSync(new URL('../../lib/financial/currencyService.js', import.meta.url), 'utf8');
  const exchange = fs.readFileSync(new URL('../../lib/financial/exchangeService.js', import.meta.url), 'utf8');
  const credits = fs.readFileSync(new URL('../../lib/financial/creditService.js', import.meta.url), 'utf8');

  assert.match(currency, /return await withTransaction\(async \(tx\) => \{[\s\S]*?currency_wallets WHERE user_id = \$1 FOR UPDATE/);
  assert.match(currency, /SELECT \* FROM currency_wallets WHERE user_id IN \(\$1, \$2\) ORDER BY user_id FOR UPDATE/);
  assert.match(exchange, /currency_wallets WHERE user_id = \$1 FOR UPDATE/);
  assert.match(exchange, /UPDATE users[\s\S]*?daily_free_credits \+ subscription_credits \+ perpetual_credits/);
  assert.match(exchange, /subscriptionBalanceAfter/);
  assert.match(credits, /SELECT \* FROM credit_wallets WHERE user_id = \$1 FOR UPDATE/);
});

test('administrator generation retries cannot request an uncharged task', () => {
  const route = fs.readFileSync(new URL('../../app/api/admin/generations/[id]/retry/route.js', import.meta.url), 'utf8');
  const service = fs.readFileSync(new URL('../../lib/services/generations.js', import.meta.url), 'utf8');
  const core = fs.readFileSync(new URL('../../lib/services/generationCore.js', import.meta.url), 'utf8');

  assert.doesNotMatch(route, /chargeCredits:\s*Boolean\(body\.chargeCredits\)/);
  assert.doesNotMatch(service, /chargeCredits\s*=\s*false/);
  assert.match(service, /chargeCredits:\s*true/);
  assert.doesNotMatch(core, /chargeCredits/);
  assert.match(core, /const quote = await resolveGenerationQuote/);
  assert.match(core, /const reservation = await reserveCredits/);
});

test('every provider generation requires a positive server-side quote and wallet reservation', () => {
  const quote = fs.readFileSync(new URL('../../lib/services/generationQuote.js', import.meta.url), 'utf8');
  const core = fs.readFileSync(new URL('../../lib/services/generationCore.js', import.meta.url), 'utf8');

  assert.match(quote, /function assertChargeable\(credits\)[\s\S]*?value <= 0/);
  assert.match(core, /const quote = await resolveGenerationQuote/);
  assert.match(core, /const reservation = await reserveCredits/);
  assert.doesNotMatch(core, /chargeCredits/);
});

test('financial reconciliation keeps database queries behind its repository interface', () => {
  const service = fs.readFileSync(new URL('../../lib/financial/reconciliation.js', import.meta.url), 'utf8');
  const repository = fs.readFileSync(new URL('../../lib/repositories/reconciliation.js', import.meta.url), 'utf8');

  assert.match(service, /from ['"]\.\.\/repositories\/reconciliation\.js['"]/);
  assert.doesNotMatch(service, /queryOne\(|query\(|SELECT |INSERT |UPDATE |DELETE /);
  assert.match(repository, /getDoubleEntryTotals/);
  assert.match(repository, /getUserPerpetualCreditLedgerTotal/);
});
