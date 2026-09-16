/**
 * 平台金融与算力系统常量与规则定义
 */

export const CURRENCY = {
  NAME: 'K-Coin',
  CODE: 'KCOIN',
  SYMBOL: '₭',
  // 汇率锚定：1 CNY = 10 K币 (即 1 K币 = 0.10 元)
  CNY_TO_COIN_RATE: 10,
  // 1 USD = 70 K币 (按 1:7 汇率换算)
  USD_TO_COIN_RATE: 70,
  // 1 K币 = 10 算力积分 (即 1 元人民币 = 100 积分)
  COIN_TO_CREDITS_RATE: 10,
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
