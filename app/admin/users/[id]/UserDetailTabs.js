'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, DataTable, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import AdminActionForm from '@/components/admin/AdminActionForm';
import { roleLabel } from '@/lib/admin/permissions';
import AdminScrollableTabs from '@/components/admin/AdminScrollableTabs';
import { GoogleIcon, XIcon, TikTokIcon, WeChatIcon, PhoneIcon, MailIcon } from '@/components/SocialIcons';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

function getProviderBadge(provider) {
  const map = {
    phone: { label: '手机短信', icon: <PhoneIcon className="size-3.5 text-success" />, bg: 'bg-success-soft border-success-soft text-success' },
    email: { label: '邮箱密码', icon: <MailIcon className="size-3.5 text-info" />, bg: 'bg-info-soft border-info-soft text-info' },
    google: { label: 'Google', icon: <GoogleIcon className="size-3.5" />, bg: 'bg-sky-500/10 border-sky-500/20 text-sky-300' },
    wechat: { label: '微信', icon: <WeChatIcon className="size-3.5" />, bg: 'bg-success-soft border-success-soft text-success' },
    tiktok: { label: 'TikTok', icon: <TikTokIcon className="size-3 text-pink-400" />, bg: 'bg-pink-500/10 border-pink-500/20 text-pink-300' },
    x: { label: 'X (Twitter)', icon: <XIcon className="size-3 text-ink" />, bg: 'bg-wash-press border-line-strong text-ink' },
  };
  const item = map[provider] || { label: provider, icon: <span className="text-xs">🔗</span>, bg: 'bg-wash-press border-line-strong text-ink' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${item.bg}`}>
      <span className="flex items-center shrink-0">{item.icon}</span>
      <span>{item.label}</span>
    </span>
  );
}

export default function UserDetailTabs({ detail }) {
  const router = useRouter();
  const [tab, setTab] = useState('overview');
  const [selectedTag, setSelectedTag] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const [tagMsg, setTagMsg] = useState('');

  const { user } = detail;
  const authAccounts = user.authAccounts || [];
  const currentTags = user.tags || [];
  const allTags = detail.allTags || [];

  const tabs = [
    { id: 'overview', label: '概览与运营标签' },
    { id: 'accounts', label: `登录账号凭据 (${authAccounts.length})` },
    { id: 'credits', label: `额度账本 (${detail.ledger.length})` },
    { id: 'billing', label: `订阅与订单 (${detail.subscriptions.length + detail.orders.length})` },
    { id: 'creations', label: `生成记录 (${detail.creations.length})` },
    { id: 'sessions', label: `活跃会话 (${detail.sessions.length})` },
    { id: 'notes', label: `管理备注 (${detail.notes.length})` },
    { id: 'audit', label: `审计流水 (${detail.audit.length})` },
  ];

  const handleTagAction = async (tagId, action) => {
    if (tagBusy) return;
    setTagBusy(true);
    setTagMsg('');
    try {
      const res = await fetch(`/api/admin/users/${user.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ tagId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '标签操作失败');
      setTagMsg(action === 'add' ? '标签添加成功' : '标签移除成功');
      router.refresh();
    } catch (err) {
      setTagMsg(err.message);
    } finally {
      setTagBusy(false);
    }
  };

  const accountColumns = [
    {
      key: 'provider',
      label: '登录渠道',
      render: (row) => getProviderBadge(row.provider),
    },
    {
      key: 'provider_user_id',
      label: '三方账户标识 / 手机 / 邮箱',
      render: (row) => (
        <div>
          <p className="font-mono text-xs text-ink">{row.provider_username || row.provider_user_id}</p>
          {row.provider_email && (
            <p className="text-[11px] text-brand-hover font-mono">邮箱: {row.provider_email}</p>
          )}
          {row.provider_username && row.provider_user_id && row.provider_username !== row.provider_user_id && (
            <p className="text-micro text-ink-subtle font-mono">UID: {row.provider_user_id}</p>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      label: '首次绑定时间',
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'last_login_at',
      label: '最近通过该方式登录',
      render: (row) => formatDate(row.last_login_at),
    },
  ];

  return (
    <div>
      {/* 可横向滑动标签栏 (对标图二可滑动菜单规范) */}
      <div className="mb-6 border-b border-line pb-3">
        <AdminScrollableTabs
          tabs={tabs}
          activeTab={tab}
          onChange={setTab}
        />
      </div>

      {/* 1. 概览与运营标签 */}
      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 基本资料 */}
          <Card>
            <h3 className="text-sm font-bold text-ink mb-4">基本资料</h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between border-b border-line-subtle pb-2">
                <span className="text-ink-subtle">用户 UID</span>
                <CopyableId id={user.id} strong />
              </div>
              <div className="flex justify-between border-b border-line-subtle pb-2">
                <span className="text-ink-subtle">显示名称</span>
                <span className="font-semibold text-ink">{user.display_name || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-line-subtle pb-2">
                <span className="text-ink-subtle">绑定邮箱</span>
                <span className="font-semibold text-ink">{user.email || '未绑定'}</span>
              </div>
              <div className="flex justify-between border-b border-line-subtle pb-2">
                <span className="text-ink-subtle">绑定手机号</span>
                <span className="font-semibold text-ink font-mono">
                  {user.phone ? `${user.phone_country_code || '+86'} ${user.phone}` : '未绑定'}
                </span>
              </div>
              <div className="flex justify-between border-b border-line-subtle pb-2">
                <span className="text-ink-subtle">内部记录 ID</span>
                <CopyableId id={user.id} />
              </div>
              <div className="flex justify-between border-b border-line-subtle pb-2">
                <span className="text-ink-subtle">注册来源渠道</span>
                <span className="font-mono text-brand-hover">{user.registration_source || 'web'}</span>
              </div>
              <div className="flex justify-between border-b border-line-subtle pb-2">
                <span className="text-ink-subtle">账户角色</span>
                <StatusBadge tone={user.role === 'user' ? 'neutral' : 'info'}>
                  {roleLabel(user.role)}
                </StatusBadge>
              </div>
              <div className="flex justify-between border-b border-line-subtle pb-2">
                <span className="text-ink-subtle">封禁状态</span>
                <StatusBadge tone={user.status === 'suspended' ? 'danger' : 'good'}>
                  {user.status === 'suspended' ? '已封禁' : '正常'}
                </StatusBadge>
              </div>
              <div className="flex justify-between border-b border-line-subtle pb-2">
                <span className="text-ink-subtle">注册时间</span>
                <span className="text-ink-muted">{formatDate(user.created_at)}</span>
              </div>
              <div className="flex justify-between border-b border-line-subtle pb-2">
                <span className="text-ink-subtle">最近登录</span>
                <span className="text-ink-muted">{formatDate(user.last_login_at)}</span>
              </div>
              <div className="flex justify-between pb-1">
                <span className="text-ink-subtle">最近登录 IP</span>
                <span className="font-mono text-ink-muted">{user.last_login_ip || '—'}</span>
              </div>
            </div>
          </Card>

          {/* 运营标签与账户控制 */}
          <div className="space-y-6">
            {/* 用户运营标签控制台 */}
            <Card>
              <h3 className="text-sm font-bold text-ink mb-2">用户运营标签</h3>
              <p className="text-xs text-ink-subtle mb-4">
                为用户打上业务/生命周期标签，便于精细化运营、定向权益发放与行为分析。
              </p>

              {/* 当前已打标签 */}
              <div className="mb-4 flex flex-wrap gap-2">
                {currentTags.length === 0 ? (
                  <span className="text-xs text-ink-subtle">暂无运营标签</span>
                ) : (
                  currentTags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-ink shadow-elevation-1"
                      style={{ backgroundColor: `${t.color}30`, borderColor: `${t.color}60`, borderWidth: 1 }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                      <span>{t.name}</span>
                      <button
                        type="button"
                        onClick={() => handleTagAction(t.id, 'remove')}
                        disabled={tagBusy}
                        className="ml-1 text-ink-subtle hover:text-ink transition disabled:opacity-30"
                        title="移除此标签"
                      >
                        ✕
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* 添加标签操作 */}
              <div className="flex items-center gap-2 border-t border-line-subtle pt-3">
                <select
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="flex-1 rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                >
                  <option value="">选择要添加的标签…</option>
                  {allTags
                    .filter((at) => !currentTags.some((ct) => ct.id === at.id))
                    .map((at) => (
                      <option key={at.id} value={at.id}>
                        {at.name} ({at.slug})
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedTag || tagBusy}
                  onClick={() => {
                    handleTagAction(selectedTag, 'add');
                    setSelectedTag('');
                  }}
                  className="h-control-md rounded-md bg-brand px-4 text-body-sm font-semibold text-ink-on-accent transition-colors duration-fast hover:bg-brand-hover disabled:opacity-40"
                >
                  打标
                </button>
              </div>

              {tagMsg && (
                <p className="mt-2 text-caption text-brand">{tagMsg}</p>
              )}
            </Card>

            {/* 高风险账户控制 */}
            <Card>
              <h3 className="text-card-title font-semibold text-ink mb-1.5">高风险账户控制</h3>
              <p className="text-body-sm text-ink-subtle mb-4">
                修改账户状态或角色会立即撤销该用户的所有会话，强制其重新登录。
              </p>

              <div className="space-y-4">
                <div className="rounded-lg border border-line-subtle bg-well p-4">
                  <p className="text-body-sm font-medium text-ink mb-2">账户封禁状态切换</p>
                  <AdminActionForm
                    action={`/api/admin/users/${user.id}`}
                    method="PATCH"
                    fields={[
                      {
                        name: 'status',
                        defaultValue: user.status === 'suspended' ? 'active' : 'suspended',
                        type: 'hidden',
                      },
                    ]}
                    submitLabel={user.status === 'suspended' ? '解除封禁' : '立即封禁账户'}
                    confirmText={user.status === 'suspended' ? '确认解除封禁该用户？' : '确认封禁该用户并撤销其所有会话？'}
                    tone={user.status === 'suspended' ? 'good' : 'danger'}
                  />
                </div>

                <div className="rounded-lg border border-line-subtle bg-well p-4">
                  <p className="text-body-sm font-medium text-ink mb-2">变更管理角色</p>
                  <AdminActionForm
                    action={`/api/admin/users/${user.id}/role`}
                    method="PATCH"
                    fields={[
                      {
                        name: 'role',
                        label: '分配角色',
                        type: 'select',
                        defaultValue: user.role,
                        options: [
                          { label: '普通用户 (user)', value: 'user' },
                          { label: '超级管理员 (super_admin)', value: 'super_admin' },
                          { label: '运营管理员 (operations_admin)', value: 'operations_admin' },
                          { label: '财务管理员 (finance_admin)', value: 'finance_admin' },
                          { label: '支持管理员 (support_admin)', value: 'support_admin' },
                          { label: '审计员 (auditor)', value: 'auditor' },
                        ],
                      },
                    ]}
                    submitLabel="保存角色分配"
                    confirmText="修改角色后将强制撤销会话，确定修改？"
                    tone="primary"
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 2. 登录账号凭据 (auth_accounts) */}
      {tab === 'accounts' && (
        <Card>
          <div className="mb-4">
            <h3 className="text-sm font-bold text-ink">关联登录账号凭据 (auth_accounts)</h3>
            <p className="mt-1 text-xs text-ink-subtle">
              展示用户主体已绑定的所有认证凭据，支持手机号、邮箱、Google、TikTok、X 1:N 解耦多账号聚合。
            </p>
          </div>
          <DataTable columns={accountColumns} rows={authAccounts} empty="未关联任何登录凭据" />
        </Card>
      )}

      {/* 3. 额度账本 */}
      {tab === 'credits' && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink">模型额度明细</h3>
              <p className="mt-1 text-xs text-ink-subtle">当前余额：{user.credits} 点</p>
            </div>
            <AdminActionForm
              action={`/api/admin/users/${user.id}/credits`}
              method="POST"
              fields={[
                { name: 'delta', label: '变动数（正数增加，负数扣减）', type: 'number', required: true },
                { name: 'reason', label: '调额原因说明', type: 'text', required: true },
              ]}
              submitLabel="调整用户额度"
              confirmText="确定为该用户调整模型额度？"
              tone="primary"
            />
          </div>
          <DataTable
            columns={[
              {
                key: 'delta',
                label: '变动点数',
                render: (row) => (
                  <span className={`font-mono font-bold ${row.delta >= 0 ? 'text-success' : 'text-danger'}`}>
                    {row.delta >= 0 ? `+${row.delta}` : row.delta}
                  </span>
                ),
              },
              { key: 'reason', label: '业务说明' },
              { key: 'created_at', label: '记录时间', render: (row) => formatDate(row.created_at) },
            ]}
            rows={detail.ledger}
            empty="暂无额度变动记录"
          />
        </Card>
      )}

      {/* 4. 订阅与订单 */}
      {tab === 'billing' && (
        <div className="space-y-6">
          <Card>
            <h3 className="text-card-title font-semibold text-ink mb-4">订阅记录</h3>
            <DataTable
              columns={[
                { key: 'plan_id', label: '套餐 Plan' },
                { key: 'provider', label: '支付渠道' },
                {
                  key: 'status',
                  label: '状态',
                  render: (row) => <StatusBadge tone={row.status === 'active' ? 'good' : 'neutral'}>{row.status}</StatusBadge>,
                },
                { key: 'current_period_end', label: '当前周期止', render: (row) => formatDate(row.current_period_end) },
              ]}
              rows={detail.subscriptions}
              empty="暂无订阅记录"
            />
          </Card>

          <Card>
            <h3 className="text-card-title font-semibold text-ink mb-4">充值与消费订单</h3>
            <DataTable
              columns={[
                { key: 'id', label: '订单号', render: (row) => <CopyableId id={row.id} /> },
                {
                  key: 'amount_minor',
                  label: '金额',
                  render: (row) => `${(row.amount_minor / 100).toFixed(2)} ${row.currency?.toUpperCase() || 'CNY'}`,
                },
                {
                  key: 'status',
                  label: '状态',
                  render: (row) => <StatusBadge tone={row.status === 'succeeded' ? 'good' : 'warn'}>{row.status}</StatusBadge>,
                },
                { key: 'created_at', label: '创建时间', render: (row) => formatDate(row.created_at) },
              ]}
              rows={detail.orders}
              empty="暂无订单记录"
            />
          </Card>
        </div>
      )}

      {/* 5. 生成记录 */}
      {tab === 'creations' && (
        <Card>
          <h3 className="text-card-title font-semibold text-ink mb-4">AI 生成记录</h3>
          <DataTable
            columns={[
              { key: 'studio_id', label: '所属模块' },
              { key: 'label', label: '生成概要' },
              { key: 'credit_cost', label: '扣减额度', render: (row) => <span className="font-mono text-brand font-medium">{row.credit_cost}</span> },
              {
                key: 'status',
                label: '状态',
                render: (row) => <StatusBadge tone={['succeeded', 'completed', 'success'].includes(row.status) ? 'good' : 'warn'}>{row.status}</StatusBadge>,
              },
              { key: 'created_at', label: '时间', render: (row) => formatDate(row.created_at) },
            ]}
            rows={detail.creations}
            empty="暂无生成记录"
          />
        </Card>
      )}

      {/* 6. 活跃会话 */}
      {tab === 'sessions' && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-card-title font-semibold text-ink">活跃会话 (Sessions)</h3>
            <AdminActionForm
              action={`/api/admin/users/${user.id}/sessions`}
              method="DELETE"
              submitLabel="强制下线所有会话"
              confirmText="将立即注销该用户所有活跃登录凭据，确定执行？"
              tone="danger"
            />
          </div>
          <DataTable
            columns={[
              { key: 'id', label: '会话 Token Hash', render: (row) => <CopyableId id={row.id || row.token_hash} /> },
              { key: 'expires_at', label: '过期时间', render: (row) => formatDate(row.expires_at) },
              { key: 'created_at', label: '创建时间', render: (row) => formatDate(row.created_at) },
            ]}
            rows={detail.sessions}
            empty="暂无有效会话"
          />
        </Card>
      )}

      {/* 7. 管理备注 */}
      {tab === 'notes' && (
        <div className="space-y-6">
          <Card>
            <h3 className="text-card-title font-semibold text-ink mb-2">添加运营/客服备注</h3>
            <AdminActionForm
              action={`/api/admin/users/${user.id}/notes`}
              method="POST"
              fields={[
                { name: 'body', label: '备注内容', type: 'text', required: true, placeholder: '记录用户偏好、投诉处理或特异情况…' },
              ]}
              submitLabel="保存内部备注"
              tone="primary"
            />
          </Card>
          <Card>
            <h3 className="text-card-title font-semibold text-ink mb-4">历史管理备注</h3>
            <div className="space-y-3">
              {detail.notes.length === 0 ? (
                <p className="text-body-sm text-ink-subtle">暂无备注</p>
              ) : (
                detail.notes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-line-subtle bg-well p-3 text-body-sm">
                    <p className="text-ink">{n.body}</p>
                    <p className="mt-2 text-caption text-ink-subtle">
                      由 {n.author_email || '管理员'} 记录于 {formatDate(n.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {/* 8. 审计流水 */}
      {tab === 'audit' && (
        <Card>
          <h3 className="text-card-title font-semibold text-ink mb-4">安全审计日志</h3>
          <DataTable
            columns={[
              { key: 'action', label: '动作事件' },
              { key: 'actor_email', label: '操作人' },
              {
                key: 'risk_level',
                label: '风险级别',
                render: (row) => (
                  <StatusBadge tone={row.risk_level === 'high' ? 'danger' : row.risk_level === 'medium' ? 'warn' : 'neutral'}>
                    {row.risk_level}
                  </StatusBadge>
                ),
              },
              { key: 'created_at', label: '时间', render: (row) => formatDate(row.created_at) },
            ]}
            rows={detail.audit}
            empty="暂无针对该用户的管理员操作审计"
          />
        </Card>
      )}
    </div>
  );
}
