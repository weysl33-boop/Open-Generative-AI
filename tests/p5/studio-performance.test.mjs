import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function source(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('P5 StandaloneShell loads Studio workbenches through direct lazy imports', async () => {
  const shell = await source('components/StandaloneShell.js');

  assert.doesNotMatch(shell, /import\s*\{[^}]*ImageStudio[^}]*\}\s*from\s*['"]studio['"]/s);
  assert.match(shell, /import\(['"]studio\/ImageStudio['"]\)/);
  assert.match(shell, /import\(['"]studio\/VideoStudio['"]\)/);
  assert.match(shell, /import\(['"]studio\/WorkflowStudio['"]\)/);
  assert.match(shell, /import\(['"]\.\/HeadshotStudio['"]\)/);
  assert.match(shell, /StudioResourceBoundary/);
  assert.match(shell, /data-active-studio=\{activeTab\}/);

  assert.doesNotMatch(
    shell,
    /className=\{activeTab === '[^']+' \? "h-full w-full" : "hidden"\}\>\s*\n\s*<[A-Z]/,
    'inactive workbenches must not remain mounted behind a hidden wrapper',
  );
});

test('P5 workflow template reads have a 200 empty fallback for an optional upstream endpoint', async () => {
  const route = await source('app/api/workflow/[[...path]]/route.js');
  const muapi = await source('packages/studio/src/muapi.js');

  assert.match(route, /get-template-workflows/);
  assert.match(route, /workflows:\s*\[\]/);
  assert.match(route, /status:\s*200/);
  assert.match(muapi, /response\.status === 404/);
  assert.match(muapi, /return \[\]/);
});

test('P5 model availability is gated by the PostgreSQL-backed active directory', async () => {
  const shell = await source('components/StandaloneShell.js');
  const models = await source('packages/studio/src/models.js');
  const migration = await source('lib/db/migrations/011_model_catalog.sql');
  const endpoint = await source('app/api/models/active/route.js');

  assert.match(shell, /fetch\('\/api\/models\/active'/);
  assert.match(shell, /applyActiveModelDirectory/);
  assert.match(shell, /modelDirectoryState === 'error'/);
  assert.match(models, /export function applyActiveModelDirectory/);
  assert.match(migration, /INSERT INTO ai_studio\.models_config/);
  assert.match(endpoint, /listActiveModels/);
});

test('P5 navigation has a real Agents entry and keeps Assistant as the Studio alias', async () => {
  const agentsPage = await source('app/agents/page.js');
  const agentDeepLink = await source('app/agents/[agent_id]/page.js');
  const conversationDeepLink = await source('app/agents/[agent_id]/[conversation_id]/page.js');
  const createDeepLink = await source('app/agents/create/page.js');
  const editDeepLink = await source('app/agents/edit/[id]/page.js');
  const assistantPage = await source('app/assistant/page.js');
  const zhAssistantPage = await source('app/zh/assistant/page.js');

  assert.match(agentsPage, /redirect\(['"]\/studio\/agents['"]\)/);
  for (const page of [agentDeepLink, conversationDeepLink, createDeepLink, editDeepLink]) {
    assert.match(page, /redirect\(/);
    assert.doesNotMatch(page, /api\.muapi\.ai|muapi_key|x-api-key/);
  }
  assert.match(assistantPage, /redirect\(['"]\/studio['"]\)/);
  assert.match(zhAssistantPage, /redirect\(['"]\/zh\/studio['"]\)/);
});

test('P5 resource boundary exposes loading, empty, failure and lifecycle telemetry seams', async () => {
  const boundary = await source('components/StudioResourceBoundary.jsx');

  for (const token of ['StudioResourceBoundary', 'StudioLoadingState', 'StudioEmptyState', 'StudioFailureState']) {
    assert.match(boundary, new RegExp(`export (?:class|function) ${token}`));
  }
  assert.match(boundary, /studio:performance/);
  assert.match(boundary, /componentWillUnmount|return \(\) =>/);
});

test('P5 high-resource workbenches clear generation timers on success, failure and unmount', async () => {
  const layers = await source('packages/studio/src/components/LayersStudio.jsx');
  const cinema = await source('packages/studio/src/components/CinemaStudio.jsx');
  const designCanvas = await source('packages/Open-AI-Design-Agent/packages/design-agent/src/CanvasArea.jsx');
  const workflowUi = await source('packages/studio/src/components/WorkflowUI.jsx');
  const workflowStudio = await source('packages/studio/src/components/WorkflowStudio.jsx');
  const designAgentStudio = await source('packages/studio/src/components/DesignAgentStudio.jsx');
  const agentStudio = await source('packages/studio/src/components/AgentStudio.jsx');

  assert.match(layers, /finally \{\s*if \(progressInterval\) clearInterval\(progressInterval\);/s);
  assert.match(cinema, /regenerateTimerRef/);
  assert.match(cinema, /clearTimeout\(regenerateTimerRef\.current\)/);
  assert.match(designCanvas, /anim\.stop\(\)/);
  assert.match(designCanvas, /videoE\.pause\(\)/);
  assert.match(workflowUi, /return \(\) => sessionStorage\.removeItem\("fromWorkflowBuilder"\)/);
  assert.doesNotMatch(workflowStudio, /window\.location\.reload\(\)/);
  assert.match(designAgentStudio, /sessionStorage\.removeItem\("fromDesignAgent"\)/);
  assert.match(agentStudio, /if \(!apiKey(?: && !signedIn)?\) \{/);
  assert.match(agentStudio, /setLoading\(false\)/);
});
