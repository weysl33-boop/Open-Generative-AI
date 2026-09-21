'use client';

import React, { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { openGlobalAccountModal } from '@/lib/accountEvents';

const AccountClient = dynamic(() => import('@/app/account/AccountClient'), {
  ssr: false,
  loading: () => null,
});

export default function AccountModal({
  isOpen,
  onClose,
  initialTab = 'price-details',
}) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // 全局监听 Esc 键关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center overflow-hidden animate-in fade-in duration-base"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="管理账户浮层"
    >
      <AccountClient
        onClose={handleClose}
        initialTabProp={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  );
}

export { openGlobalAccountModal };
