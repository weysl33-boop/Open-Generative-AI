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

/**
 * 硬币 (Coin) 是站内独立的权益凭证，不与算力积分互通：算力只能由订阅与算力包提供。
 * 这里只登记它的发放口径；权益兑换的枚数定价见 lib/benefits/catalog.js。
 * 任何用户可见文案都不得出现硬币的美元等值、汇率或购买力口径。
 */
export const CURRENCY = {
  NAME: 'Coin',
  CODE: 'COIN',
  SYMBOL: '🪙',
  // 站内唯二获取渠道：每日登录 1 枚，以及经人工审核认定的有效建议 / 报错 / 漏洞提交。
  // 没有现金充值入口，社区投币只是消耗，不会给作者增加硬币，用户之间也不可转让。
  DAILY_LOGIN_REWARD: 1,
  FEEDBACK_REWARD_DEFAULTS: {
    bug_report: 2,
    improvement: 5,
    security: 20,
  },
  // 互动投币机制 (参考 B 站硬币)：单次投币最高 2 枚，单作累计最高 2 枚，投出即消耗
  MAX_POST_TIP_COINS: 2,
};

export const ACCOUNT_CODES = {
  ASSET_GATEWAY_DEPOSIT: '1001',   // 资产类：第三方通道存款 (微信/支付宝/Stripe)
  LIABILITY_USER_AVAILABLE: '2001', // 负债类：用户可用通用货币 (仅限站内兑换)
  LIABILITY_USER_RESTRICTED: '2002',// 负债类：用户受限货币 (活动赠送，不可转账)
  LIABILITY_IN_TRANSIT: '2003',     // 负债类：在途冻结负债
  REVENUE_FULFILLMENT: '4002',      // 收入类：算力兑换/会员履约销售收入
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
