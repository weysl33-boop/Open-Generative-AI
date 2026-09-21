import 'server-only';

import {
  CREDIT_VALUATION_SETTING_KEY,
  resolveCreditValuationFromSetting,
} from '../financial/creditValuation.js';
import { getSettingByKey } from './settings.js';

/**
 * 估值的运行期读取入口：系统设置 credit_valuation 优先，缺失或非法退回内置口径。
 * 判定与换算都在纯模块里，这一层只负责取设置，读设置失败不能让请求整条挂掉。
 */
export async function resolveCreditValuation() {
  try {
    const row = await getSettingByKey(CREDIT_VALUATION_SETTING_KEY);
    return resolveCreditValuationFromSetting(row ? row.value : null);
  } catch (err) {
    console.warn('[creditValuation] 读取系统设置失败，退回内置估值:', err?.message || err);
    return resolveCreditValuationFromSetting(null);
  }
}

export { CREDIT_VALUATION_SETTING_KEY };
