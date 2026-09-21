import 'server-only';

import { getSettingByKey, updateSettingValue } from '../repositories/settings.js';
import { logAudit } from '../admin/audit.js';
import { withTransaction } from '../db/index.js';

export const DEFAULT_SUBSCRIPTION_FAQ_CONFIG = {
  notice: '所有会员套餐均支持随时升级或取消，算力随周期自动充值发放，未生成成功系统自动秒级返还。',
  supportEmail: 'support@koyosim.com',
  invoiceNotice: '支持开具增值税电子普通发票与专用发票，请在个人中心提交开票信息。',
  items: [
    {
      id: 'faq-1',
      order: 1,
      enabled: true,
      category: 'quota',
      question: '什么是订阅制专属额度？与通用算力有何区别？',
      answer: '订阅额度是每月随会员周期发放的核心资产，享有最高抵扣优先级，当月有效；通用算力永久有效，在月度额度用尽后自动作为备用池抵扣，两者协同保障您的创作不间断。',
    },
    {
      id: 'faq-2',
      order: 2,
      enabled: true,
      category: 'quota',
      question: '生成失败会扣除我的额度吗？',
      answer: '绝对不会。系统采用两阶段安全预扣机制，因合规拦截或模型超时等非用户原因未完成时，冻结额度将在 1 秒内 100% 自动解冻返还至您的账户。',
    },
    {
      id: 'faq-3',
      order: 3,
      enabled: true,
      category: 'payment',
      question: '支持哪些支付方式与开票？',
      answer: '全面支持支付宝扫码、微信支付直付及国际信用卡（Visa / MasterCard）。创作者与企业用户可在个人中心“订单发票”页面随时申请增值税电子发票。',
    },
    {
      id: 'faq-4',
      order: 4,
      enabled: true,
      category: 'subscription',
      question: '支持随时变更或取消订阅吗？',
      answer: '由您完全自主控制。您可以随时在个人中心“会员订阅”中查看当前方案、升级档位或管理续费。取消后，已生效周期的全部权益与算力仍可正常使用直至周期届满。',
    },
    {
      id: 'faq-5',
      order: 5,
      enabled: true,
      category: 'subscription',
      question: '订阅后切换套餐，算力及权益会怎么变化？',
      answer: `KoyoSIM 提供灵活的月度、季度与年度订阅方案，每个方案都包含一定数量的算力，可用于图像生成、视频生成、音乐生成与编辑等功能。注：进行档位升级或延长时，暂不支持补差价升级方式，升级支付档位正常价格。具体分为以下六种情况：

(1) 月付套餐：从低档位升级到高档位
• 剩余未使用的算力，会继续为您保留（有效期不变）
• 新的订阅套餐，将从升级付款成功之日起，重新按 31 天计算，算力即刻到账

(2) 季付套餐：从低档位升级到高档位
• 订阅新升级套餐前已发放的、剩余未使用的算力，会继续为您保留（有效期不变）
• 新的季付订阅套餐，将从升级付款成功之日起，重新按 93 天计算，首月算力即刻到账
• 退款处理：原低档位套餐中，尚未发放算力月份对应的费用，我们将为您办理退款（原支付路径返还，5-10 个工作日）

(3) 年付套餐：从低档位升级到高档位
• 订阅新升级套餐前已发放的、剩余未使用的算力，会继续为您保留（有效期不变）
• 新的年付订阅套餐，将从升级付款成功之日起，重新按 365 天计算，首月算力即刻到账
• 退款处理：原低档位套餐中，尚未发放算力月份对应的费用，我们将为您办理退款（原支付路径返还，5-10 个工作日）

(4) 同档位套餐：从月付升级为季付
• 剩余未使用的算力，会继续为您保留（有效期不变）
• 新的季付订阅套餐，将从升级付款成功之日起，重新按 93 天计算，算力即刻到账

(5) 同档位套餐：从月付升级为年付
• 订阅新升级套餐前已发放的、剩余未使用的算力，会继续为您保留（有效期不变）
• 新的年付订阅套餐，将从升级付款成功之日起，重新按 365 天计算，首月算力即刻到账
• 退款处理：原低档位套餐中，尚未发放算力月份对应的费用，我们将为您办理退款（原支付路径返还，5-10 个工作日）

(6) 同档位套餐：从季付升级为年付
• 订阅新升级套餐前已发放的、剩余未使用的算力，会继续为您保留（有效期不变）
• 新的年付订阅套餐，将从升级付款成功之日起，重新按 365 天计算，首月算力即刻到账
• 退款处理：原低档位套餐中，尚未发放算力月份对应的费用，我们将为您办理退款（原支付路径返还，5-10 个工作日）

温馨提示：如有疑问可随时通过客服渠道或发送邮件至 support@koyosim.com 联系我们。`,
    },
    {
      id: 'faq-6',
      order: 6,
      enabled: true,
      category: 'subscription',
      question: '关于自动续费与取消自动续费？',
      answer: '如果您开通了周期连续订阅，系统将在每个账期届满前 24 小时向您发送通知或发起续期。您可随时在个人中心“会员订阅”中点击关闭自动续费，关闭后不会影响当前周期的任何特权与可用算力，次期将不再进行任何扣款。',
    },
    {
      id: 'faq-7',
      order: 7,
      enabled: true,
      category: 'refund',
      question: '如何申请退款？',
      answer: '如果您在最近一次付款后未有任何生成行为、权益使用和算力消耗，可在购买后 7 天内申请全额退款。若因系统故障导致生成失败，系统将自动返还相应算力。如需申请退款，请前往个人中心提交工单或发送邮件（附带您的账号与退款原因）至客服邮箱，审核通过后将在 5-10 个工作日内退回原支付账户。',
    },
    {
      id: 'faq-8',
      order: 8,
      enabled: true,
      category: 'payment',
      question: '我们支持下载账单凭证，以及企业用户的开发票服务。',
      answer: '支持。您可以在个人中心的“订单与发票”板块一键下载所有充值与订阅的电子对账凭据。针对企业团队用户，我们支持开具增值税普通发票及增值税专用发票，后台直接录入开票抬头和企业统一社会信用代码即可申请。',
    },
    {
      id: 'faq-9',
      order: 9,
      enabled: true,
      category: 'copyright',
      question: '我在 KoyoSIM 生成的内容归谁所有？',
      answer: '在法律允许的最大范围内，您拥有在 KoyoSIM 上生成的所有内容的所有权。平台不会对用户创作的作品主张任何版权。这意味着您可以自由地发布、下载、分发和将这些视频及图像用于商业盈利场景。',
    },
    {
      id: 'faq-10',
      order: 10,
      enabled: true,
      category: 'legal',
      question: '免责声明与服务支持',
      answer: '上述内容仅供参考。KoyoSIM 会根据产品功能迭代与用户体验需要，适时优化功能、价格、订阅方案及算力规则。如出现争议或不一致情况，将以后台系统实际记录与财务账单数据为准，最终解释权归 KoyoSIM 所有。其他相关细则详见《用户协议》与《隐私政策》。',
    },
  ],
};

/**
 * 获取当前生效的订阅 QA 与说明配置
 */
export async function getSubscriptionFaqConfig() {
  try {
    const row = await getSettingByKey('subscription_faq_config');
    if (!row?.value || typeof row.value !== 'object') {
      return { ...DEFAULT_SUBSCRIPTION_FAQ_CONFIG };
    }
    const val = row.value;
    const items = Array.isArray(val.items) && val.items.length > 0 ? val.items : DEFAULT_SUBSCRIPTION_FAQ_CONFIG.items;
    return {
      notice: typeof val.notice === 'string' ? val.notice : DEFAULT_SUBSCRIPTION_FAQ_CONFIG.notice,
      supportEmail: typeof val.supportEmail === 'string' ? val.supportEmail : DEFAULT_SUBSCRIPTION_FAQ_CONFIG.supportEmail,
      invoiceNotice: typeof val.invoiceNotice === 'string' ? val.invoiceNotice : DEFAULT_SUBSCRIPTION_FAQ_CONFIG.invoiceNotice,
      items: items.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)),
    };
  } catch (err) {
    console.error('[subscriptionFaq] getSubscriptionFaqConfig fallback:', err?.message || err);
    return { ...DEFAULT_SUBSCRIPTION_FAQ_CONFIG };
  }
}

/**
 * 保存订阅 QA 配置并记录操作审计
 */
export async function saveSubscriptionFaqConfig({ actor, config, requestId }) {
  if (!config || typeof config !== 'object') {
    return { error: '配置格式不正确' };
  }

  const items = Array.isArray(config.items) ? config.items : [];
  const sanitizedItems = items.map((item, idx) => ({
    id: item.id || `faq-${Date.now()}-${idx}`,
    order: Number(item.order) || (idx + 1),
    enabled: item.enabled !== false,
    category: String(item.category || 'general').trim(),
    question: String(item.question || '').trim(),
    answer: String(item.answer || '').trim(),
  })).filter((item) => item.question.length > 0);

  const cleanConfig = {
    notice: String(config.notice || DEFAULT_SUBSCRIPTION_FAQ_CONFIG.notice).trim(),
    supportEmail: String(config.supportEmail || DEFAULT_SUBSCRIPTION_FAQ_CONFIG.supportEmail).trim(),
    invoiceNotice: String(config.invoiceNotice || DEFAULT_SUBSCRIPTION_FAQ_CONFIG.invoiceNotice).trim(),
    items: sanitizedItems.sort((a, b) => a.order - b.order),
  };

  return await withTransaction(async (tx) => {
    const existing = await getSettingByKey('subscription_faq_config', tx);
    await updateSettingValue({
      key: 'subscription_faq_config',
      value: cleanConfig,
      updatedBy: actor.email,
      transaction: tx,
    });

    await logAudit({
      actor,
      action: 'settings.subscription_faq_update',
      targetType: 'system_setting',
      targetId: 'subscription_faq_config',
      riskLevel: 'medium',
      before: existing ? existing.value : null,
      after: cleanConfig,
      requestId,
      transaction: tx,
    });

    return { success: true, config: cleanConfig };
  });
}
