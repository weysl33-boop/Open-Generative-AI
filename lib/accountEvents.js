/**
 * 全局个人中心浮窗事件派发工具
 * 独立于组件，防止任何模块循环依赖
 */
export function openGlobalAccountModal(tab = 'price-details') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('open-account-modal', {
        detail: { tab },
      })
    );
  }
}
