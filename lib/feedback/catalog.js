/**
 * 建议 / 报错 / 漏洞提交的共享目录：客户端表单与服务端校验共用同一份，避免两边漂移。
 * id 必须与 lib/db/migrations/030_feedback_reports.sql 里 kind 的 CHECK 约束一致。
 */
export const FEEDBACK_KINDS = [
  {
    id: 'bug_report',
    label: '网站报错或功能异常',
    hint: '哪个页面、什么操作、看到了什么提示。附上复现步骤更容易被判定有效。',
    rewardDefault: 2,
  },
  {
    id: 'improvement',
    label: '体验改善建议',
    hint: '交互、文案、流程或功能上的具体改进点，以及它解决了什么问题。',
    rewardDefault: 5,
  },
  {
    id: 'security',
    label: '安全漏洞提交',
    hint: '请描述影响面与验证思路，不要公开利用细节；我们确认后会尽快修复。',
    rewardDefault: 20,
  },
];

export const FEEDBACK_STATUS_LABELS = {
  pending: '待审核',
  accepted: '已采纳',
  rejected: '未采纳',
};

export function findFeedbackKind(id) {
  return FEEDBACK_KINDS.find((kind) => kind.id === id) || null;
}
