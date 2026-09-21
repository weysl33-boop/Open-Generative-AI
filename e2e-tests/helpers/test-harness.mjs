/**
 * E2E Test Suite - Test Registration and Execution Harness
 * 遵循 Opaque-box 黑盒测试原则，提供轻量、结构化的测试套件定义与独立运行能力
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as db from './db-verifier.mjs';
import * as mock from './mock-provider.mjs';
import { ApiClient, createApiClient } from './api-client.mjs';

const registeredSuites = [];

/**
 * 注册测试套件
 * @param {Object} suiteDef
 * @param {string} suiteDef.id - 唯一标识 (如 'f01-pg-migrations')
 * @param {string} suiteDef.tier - 归属 Tier ('tier1' | 'tier2' | 'tier3' | 'tier4')
 * @param {string} [suiteDef.feature] - 归属特性 ('F01' ~ 'F19')
 * @param {string} suiteDef.title - 套件标题
 * @param {Array<{name: string, run: Function}>} suiteDef.tests - 测试用例列表
 */
export function defineTestSuite(suiteDef) {
  if (!suiteDef.id || !suiteDef.tier || !suiteDef.title || !Array.isArray(suiteDef.tests)) {
    throw new Error(`[test-harness] 非法的测试套件定义: ${JSON.stringify(suiteDef.id)}`);
  }
  registeredSuites.push(suiteDef);
}

export function getRegisteredSuites() {
  return registeredSuites;
}

export function clearRegisteredSuites() {
  registeredSuites.length = 0;
}

export function createTestContext(baseURL = null) {
  const api = createApiClient(baseURL);
  return {
    db,
    api,
    mock,
    assert,
  };
}

/**
 * 如果测试文件被 node 直接运行，则独立执行自身
 */
export async function runIfDirect(importMetaUrl) {
  if (process.argv[1] && fileURLToPath(importMetaUrl) === process.argv[1]) {
    const { runSuites } = await import('../runner.mjs');
    const suites = registeredSuites.slice();
    clearRegisteredSuites();
    await runSuites(suites);
  }
}
