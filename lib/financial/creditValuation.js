import { CREDIT_VALUATION } from './constants.js';

/**
 * Credits 估值的口径来源。
 *
 * 这里只做纯换算，不碰数据库：报价链路、报表和模型中心必须拿到同一个数字，
 * 而它此前被抄成了两份（$0.01/Credit 与 ¥0.07/Credit），同一笔消耗能算出两个
 * 毛利率。读取系统设置的那一层在 lib/services/creditValuation.js，本模块可以
 * 直接被普通测试实例化。
 *
 * 可配置的只有「1 Credit 值多少美元」。美元↔人民币汇率不是配置项：渠道成本换算
 * 用的是 lib/modelCenter/routing.js 里的同一个常量，若这里放开就会变成一半可改、
 * 一半改不动的假设置。
 */
export const CREDIT_VALUATION_SETTING_KEY = 'credit_valuation';

export const BUILT_IN_CREDIT_VALUATION = {
  usdPerCredit: CREDIT_VALUATION.USD_PER_CREDIT,
  usdToCnyRate: CREDIT_VALUATION.USD_TO_CNY_RATE,
};

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function valuation({ usdPerCredit, usdToCnyRate, source }) {
  return {
    usdPerCredit,
    creditsPerUsd: Number((1 / usdPerCredit).toFixed(10)),
    usdToCnyRate,
    cnyPerCredit: Number((usdPerCredit * usdToCnyRate).toFixed(6)),
    source,
  };
}

/**
 * 设置里的值不是正数就整份退回内置口径并标成 invalid：半个估值口径比没有口径
 * 更危险——它会让屏幕上的毛利率看起来像确认过的数字。
 */
export function resolveCreditValuationFromSetting(rawValue) {
  const usdToCnyRate = BUILT_IN_CREDIT_VALUATION.usdToCnyRate;
  if (rawValue === null || rawValue === undefined) {
    return valuation({ usdPerCredit: BUILT_IN_CREDIT_VALUATION.usdPerCredit, usdToCnyRate, source: 'default' });
  }
  const usdPerCredit =
    rawValue && typeof rawValue === 'object' ? positiveNumber(rawValue.usdPerCredit) : null;
  if (!usdPerCredit) {
    return valuation({ usdPerCredit: BUILT_IN_CREDIT_VALUATION.usdPerCredit, usdToCnyRate, source: 'invalid' });
  }
  return valuation({ usdPerCredit, usdToCnyRate, source: 'setting' });
}
