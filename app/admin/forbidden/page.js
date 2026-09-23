import Link from 'next/link';
import { ShieldX, ArrowLeft } from 'lucide-react';

export const metadata = { title: '无权限访问 | 管理后台' };

export default async function AdminForbiddenPage({ searchParams }) {
  const params = await searchParams;
  const raw = typeof params?.p === 'string' ? params.p : null;
  const permission = raw && /^[a-z][a-z_.-]{0,63}$/.test(raw) ? raw : null;

  return (
    <div className="flex min-h-96 items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-danger-line bg-surface p-8 text-center shadow-elevation-4 backdrop-blur-md">
        <div className="mx-auto flex size-14 items-center justify-center rounded-lg border border-danger-line bg-danger-soft text-danger">
          <ShieldX className="size-7" />
        </div>
        <p className="mt-5 text-caption font-semibold uppercase tracking-widest text-danger">403 · 无权限访问</p>
        <h1 className="mt-2 text-section-title text-ink">当前角色不具备该页面的访问权限</h1>
        <p className="mt-2.5 text-body-sm leading-6 text-ink-muted">
          该功能需要权限
          {permission ? (
            <span className="mx-1 rounded-sm border border-line-subtle bg-wash px-1.5 py-0.5 font-mono text-label text-ink">
              {permission}
            </span>
          ) : null}
          ，如需开通请联系超级管理员调整角色授权。
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/admin"
            className="inline-flex h-control-md items-center gap-1.5 rounded-md bg-brand px-4 text-label font-semibold text-ink-on-accent transition-colors duration-fast hover:bg-brand-hover"
          >
            <ArrowLeft className="size-3.5" />
            返回运营概览
          </Link>
        </div>
      </div>
    </div>
  );
}
