'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Receipt, FileText, Download, Loader2 } from 'lucide-react';

export default function InvoicesTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchOrders() {
      try {
        const res = await fetch('/api/billing/orders/my');
        if (res.ok) {
          const data = await res.json();
          if (active && data.orders) {
            setOrders(data.orders);
          }
        }
      } catch (err) {
        console.error('加载订单与发票失败:', err);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchOrders();
    return () => { active = false; };
  }, []);

  const handleDownloadReceipt = (order) => {
    const receiptContent = `=========================================
          KOYOSIM AI 电子消费收据
=========================================
收据凭证号: ${order.id}
套餐名称:   ${order.plan}
交易金额:   ${order.amount}
开具时间:   ${order.date}
交易状态:   ${order.status}
服务提供方: KOYOSIM GENERATIVE AI PLATFORM
官方网址:   https://www.koyosim.com
=========================================
感谢您对 KOYOSIM 创作者平台的支持！
`;
    const blob = new Blob([receiptContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Receipt_${order.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full flex flex-col h-full max-w-3xl mx-auto">
      <h3 className="text-xl font-bold text-ink text-center mb-6 tracking-tight">
        订单与发票
      </h3>

      <div className="rounded-xl border border-line-subtle bg-raised overflow-hidden">
        <div className="border-b border-line px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="size-4 text-success" />
            <span className="text-sm font-semibold text-ink">历史订阅与充值发票</span>
          </div>
          <span className="text-xs text-ink-subtle">电子发票即开即发 · 实时同步数据库</span>
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-ink-muted">
            <Loader2 className="size-6 animate-spin text-success" />
            <span className="text-xs">正在拉取您的账单记录...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center gap-3">
            <div className="size-12 rounded-full bg-wash border border-line flex items-center justify-center text-ink-muted">
              <FileText className="size-6 text-ink-subtle" />
            </div>
            <p className="text-sm font-medium text-ink">暂无订单发票记录</p>
            <p className="text-xs text-ink-subtle max-w-sm">
              当您完成算力包充值或订阅创作者会员后，对应的官方账单与电子凭证将自动归档在此处。
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line-subtle">
            {orders.map((inv) => (
              <div key={inv.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-wash transition-colors min-h-[64px]">
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink truncate">{inv.plan}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-micro font-medium shrink-0 ${
                      inv.color === 'emerald'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : inv.color === 'amber'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                        : 'border-gray-500/30 bg-gray-500/10 text-ink-muted'
                    }`}>
                      {inv.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-ink-subtle font-mono">
                    <span>订单号: {inv.id}</span>
                    <span>开票日期: {inv.date}</span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-4">
                  <span className="text-sm font-semibold text-ink font-mono">{inv.amount}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3.5 border-line bg-wash text-xs text-ink hover:bg-wash-strong hover:text-ink rounded-full font-medium flex items-center gap-1.5"
                    onClick={() => handleDownloadReceipt(inv)}
                  >
                    <Download className="size-3.5" />
                    下载凭证
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
