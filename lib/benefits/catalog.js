/**
 * 硬币权益目录：兑换页展示与服务端核销共用同一份，价格与效果只在这里定义。
 * 头像框的 ringClasses 必须是 globals.css 已注册的语义 token，不允许裸色值。
 *
 * 硬币不参与算力的计价，也不与现金互通，所以这里只登记权益类消耗。
 * 枚数是按内部锚定（100 硬币 = 1 美元，1 枚 ≈ 每日登录一天的沉淀）人工定的定价，
 * 该锚定只用于定价与后台核算，任何用户可见文案都不得出现美元等值、汇率或购买力口径。
 */
export const AVATAR_FRAMES = {
  'coin-gold': { label: '鎏金头像框', ringClasses: 'border-2 border-warning' },
  'coin-cyan': { label: '霓虹头像框', ringClasses: 'border-2 border-brand' },
};

export const BENEFITS = [
  {
    id: 'boost_24h',
    kind: 'priority',
    coins: 3,
    hours: 24,
    title: '优先出图加速卡 · 24 小时',
    summary: '有效期内的生成任务在出站队列里排在普通任务之前，繁忙时段先出图。',
  },
  {
    id: 'boost_72h',
    kind: 'priority',
    coins: 8,
    hours: 72,
    title: '优先出图加速卡 · 72 小时',
    summary: '三天连续优先，重复兑换按剩余时长顺延叠加。',
  },
  {
    id: 'frame_coin_gold',
    kind: 'avatar_frame',
    coins: 30,
    frame: 'coin-gold',
    title: '鎏金头像框（永久）',
    summary: '站内头像外圈常驻鎏金描边，一次兑换永久拥有，可随时佩戴或摘下。',
  },
  {
    id: 'frame_coin_cyan',
    kind: 'avatar_frame',
    coins: 60,
    frame: 'coin-cyan',
    title: '霓虹头像框（永久）',
    summary: '站内头像外圈常驻霓虹描边，一次兑换永久拥有，可随时佩戴或摘下。',
  },
];

export const BENEFIT_STATUS_LABELS = {
  priority: '优先出图',
  avatar_frame: '头像框',
};

export function findBenefit(id) {
  return BENEFITS.find((benefit) => benefit.id === id) || null;
}

/** 头像框描边：佩戴者拿到 ringClasses，未佩戴/未知值回落到调用方自带的 border-line。 */
export function avatarFrameClasses(frame) {
  return AVATAR_FRAMES[frame]?.ringClasses || '';
}
