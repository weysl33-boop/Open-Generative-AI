'use client';

import { useState } from 'react';

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
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <div>
        <label className="block text-xs font-semibold text-white/50 mb-1">
          目标用户 ID (usr_xxx)
        </label>
        <input
          type="text"
          required
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="usr_..."
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-300/60"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-white/50 mb-1">
          分配管理角色
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-300/60"
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
        <label className="block text-xs font-semibold text-white/50 mb-1">
          你的超级管理员登录密码（再认证）
        </label>
        <input
          type="password"
          required
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          placeholder="当前登录超管账号的密码"
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-300/60"
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-bold text-black transition hover:bg-cyan-200 disabled:opacity-50"
      >
        {busy ? '正在执行角色变更…' : '确认变更角色并强制其会话刷新'}
      </button>

      {message && (
        <p className={`text-xs ${isError ? 'text-red-300' : 'text-cyan-200'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
