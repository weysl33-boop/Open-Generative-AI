/**
 * 平台金融与算力系统常量与规则定义
 */

/**
 * 算力点 (Credits) 估值的内置默认值 —— 只在系统设置里没有配置时生效。
 * 运行时口径必须走 lib/services/creditValuation.js 的 resolveCreditValuation()，
 * 页面与报表都读它的返回值；这里再被直接引用一次就成了第二个事实来源。
 */
export const CREDIT_VALUATION = {
  CREDITS_PER_USD: 100,
  USD_PER_CREDIT: 0.01,
  USD_TO_CNY_RATE: 7.2,
};

export const CURRENCY = {
  NAME: 'K-Coin',
  CODE: 'KCOIN',
  SYMBOL: '🪙',
  // 核心价值锚定：1 K币 = 1 USD (以美元为基本核算单位，对外不直接展示浮动汇率)
  BASE_UNIT: 'USD',
  USD_TO_COIN_RATE: 1,
  USD_PER_COIN: 1,
  // 浮动汇率底层核算 (当前 1 USD ≈ 7.23 CNY，系统内部核算，对外不展示)
  FLOAT_CNY_USD_RATE: 7.23,
  CNY_TO_COIN_RATE: 1 / 7.23,
  // K 币 -> 算力点兑换比例：1 K币 = 1 USD，所以它就等于估值口径的 credits/USD。
  // 此前该常量不存在，exchangeCoinToCredits 用 numCoins * undefined 算出 NaN，
  // 而 NaN <= 0 为 false 会绕过守卫，把 NaN 写进余额更新。
  COIN_TO_CREDITS_RATE: CREDIT_VALUATION.CREDITS_PER_USD,
  // 平台专属货币属性：不可充值，杜绝投机与现金充值，纯由登录激励与社区创作产生
  IS_RECHARGEABLE: false,
  // 获得机制 (参考 B 站硬币)：每日登录奖励 1 枚 K 币
  DAILY_LOGIN_REWARD: 1,
  // 互动投币机制 (参考 B 站硬币)：单次投币最高 2 币，单作累计最高 2 币
  MAX_POST_TIP_COINS: 2,
};

export const ACCOUNT_CODES = {
  ASSET_GATEWAY_DEPOSIT: '1001',   // 资产类：第三方通道存款 (微信/支付宝/Stripe)
  LIABILITY_USER_AVAILABLE: '2001', // 负债类：用户可用通用货币 (可转账/可兑换)
  LIABILITY_USER_RESTRICTED: '2002',// 负债类：用户受限货币 (活动赠送，不可转账)
  LIABILITY_IN_TRANSIT: '2003',     // 负债类：在途冻结负债
  REVENUE_SERVICE_FEE: '4001',      // 收入类：转账/平台手续费收入
  REVENUE_FULFILLMENT: '4002',      // 收入类：算力兑换/会员履约销售收入
};

export const RISK_RULES = {
  // 转账限制
  MIN_TRANSFER_AMOUNT: 1,           // 最低转账 1 币
  MAX_SINGLE_TRANSFER: 1000,        // 单笔最高 1000 币
  MAX_DAILY_TRANSFER: 5000,         // 单日累计最高 5000 币
  TRANSFER_FEE_RATE: 0.01,          // 1% 转账平台服务费
  MIN_TRANSFER_FEE: 0.1,            // 最低 0.1 币手续费
  TRANSFER_INTERVAL_SECONDS: 5,     // 两次转账最小防刷间隔
};

export const CREDIT_BUCKET_TYPES = {
  DAILY_FREE: 'DAILY_FREE',         // 每日免费池 (当天过期)
  SUBSCRIPTION: 'SUBSCRIPTION',     // 月度订阅池 (随订阅周期过期)
  PERPETUAL: 'PERPETUAL',           // 永久购买池 (永久有效)
};

export const RESERVATION_STATUS = {
  RESERVED: 'RESERVED',             // 预冻结中
  COMMITTED: 'COMMITTED',           // 已确认结算扣减
  VOIDED: 'VOIDED',                 // 已释放解冻
  EXPIRED: 'EXPIRED',               // 超时强制解冻
};

export const RESERVATION_TTL_MINUTES = 15; // 预扣单最大保留 15 分钟
export const DAILY_CHECKIN_REWARD = 10;    // 每日签到奖励 10 积分
