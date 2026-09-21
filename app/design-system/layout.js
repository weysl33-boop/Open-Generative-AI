// 组件画廊是内部页面：零入链、无鉴权，谁都能爬到，所以必须在这里断掉索引。
// 单独一个 layout 是因为 app/design-system/page.js 是客户端组件，导出不了 metadata。
export const metadata = {
  title: 'Design system — koyosim',
  robots: { index: false, follow: false },
};

export default function DesignSystemLayout({ children }) {
  return children;
}
