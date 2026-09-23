'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function AdminRoleModifier() {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('operations_admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!window.confirm('变更管理员角色属于高风险操作，会记录严格审计日志并强制该用户下线重新登录。是否确认继续？')) return;

    setBusy(true);
    setMessage('');
    setIsError(false);

    try {
      const res = await fetch(`/api/admin/admins/${userId.trim()}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          role,
          adminPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || '角色更新失败');
      }

      setMessage('管理员角色更新成功');
      setAdminPassword('');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setIsError(true);
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-label font-medium text-ink-muted mb-1.5">
          目标用户内部记录 ID (usr_xxx)
        </label>
        <Input
          type="text"
          required
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="usr_..."
          size="md"
        />
      </div>

      <div>
        <label className="block text-label font-medium text-ink-muted mb-1.5">
          分配管理角色
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="h-control-md w-full rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
        >
          <option value="operations_admin">运营管理员 (内容、生成、用户)</option>
          <option value="finance_admin">财务管理员 (订阅、订单、调额、套餐)</option>
          <option value="support_admin">支持管理员 (用户排查、受限调额)</option>
          <option value="auditor">审计只读 (全业务只读、审计日志)</option>
          <option value="super_admin">超级管理员 (最高全权限)</option>
          <option value="user">降级为普通用户 (移除后台权限)</option>
        </select>
      </div>

      <div>
        <label className="block text-label font-medium text-ink-muted mb-1.5">
          你的超级管理员登录密码（再认证）
        </label>
        <Input
          type="password"
          required
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          placeholder="当前登录超管账号的密码"
          size="md"
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={busy}
        loading={busy}
        fullWidth
      >
        {busy ? '正在提交…' : '提交变更并重置该管理员会话'}
      </Button>

      {message && (
        <div
          className={`rounded-md p-3 text-caption ${
            isError
              ? 'border border-danger-line bg-danger-soft text-danger'
              : 'border border-brand-line bg-brand-soft text-brand'
          }`}
        >
          {message}
        </div>
      )}
    </form>
  );
}
