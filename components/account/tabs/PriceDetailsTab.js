'use client';

import React from 'react';

const PRICE_CATEGORIES = [
  {
    id: 'dialogue',
    classification: '对话模型',
    description: '(Agent对话&剧本创作)',
    rows: [
      {
        model: 'N/A',
        price: '每轮对话5积分',
      },
    ],
    note: '会员享 LLM 无限免费使用（含防刷机制）',
  },
  {
    id: 'image-generation',
    classification: '图片生成',
    note: '所有人可用',
    rows: [
      {
        model: 'Flova Image 2.5 Sunburst (1K)',
        price: '8月18日--9月20日，限时特惠：月付会员 3积分/张，年付会员 2积分/张；结束后，统一恢复为 5积分/张。',
      },
      {
        model: 'Flova Image 2.5 Sunburst (2K)',
        price: '7 积分/张',
      },
      {
        model: 'Flova Image 2.5 Sunburst (4K)',
        price: '15 积分/张',
      },
      {
        model: 'Flova Image 2.5 Flare (1K)',
        price: '8月18日--9月20日，限时特惠：月付会员 3积分/张，年付会员 2积分/张；结束后，统一恢复为 5积分/张。',
      },
      {
        model: 'Flova Image 2.5 Flare (2K)',
        price: '7 积分/张',
      },
      {
        model: 'Flova Image 2.5 Flare (4K)',
        price: '15 积分/张',
      },
      {
        model: 'Flova Image 2 (1K/2K)',
        price: '5 积分/张',
      },
      {
        model: 'Flova Image 2 (4K)',
        price: '10 积分/张',
      },
      {
        model: 'Flova Nano 2 (1K)',
        price: '7 积分/张',
      },
      {
        model: 'Flova Nano 2 (2K)',
        price: '11 积分/张',
      },
      {
        model: 'Flova Nano 2 (4K)',
        price: '16 积分/张',
      },
      {
        model: 'Flova Nano Pro (1K/2K)',
        price: '14 积分/张',
      },
      {
        model: 'Flova Nano Pro (4K)',
        price: '25 积分/张',
      },
    ],
  },
];

export default function PriceDetailsTab() {
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const headerClass = 'border border-line-subtle px-4 py-3 text-[13px] font-bold text-ink bg-overlay text-start';
  const cellClass = (isFirst) => `border border-white/[0.06] px-4 py-3 text-[12px] text-ink ${isFirst ? 'border-t-0' : ''}`;

  const displayedCategories = PRICE_CATEGORIES.filter(
    (c) => selectedCategory === 'all' || c.id === selectedCategory
  );

  return (
    <div className="w-full flex flex-col h-full">
      {/* 居中大标题与分类过滤胶囊 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-ink tracking-tight">模型价格表</h3>
          <p className="text-xs text-ink-muted mt-0.5">透明明细计费 · 会员尊享无限 LLM 与限时折扣</p>
        </div>
        <div className="flex items-center gap-1.5 bg-well p-1 rounded-full border border-line self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              selectedCategory === 'all'
                ? 'bg-surface-inverse text-ink-inverse font-semibold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            全部
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('dialogue')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              selectedCategory === 'dialogue'
                ? 'bg-surface-inverse text-ink-inverse font-semibold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            对话模型
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('image-generation')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              selectedCategory === 'image-generation'
                ? 'bg-surface-inverse text-ink-inverse font-semibold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            图片生成
          </button>
        </div>
      </div>

      {/* 桌面端高保真表格 */}
      <div className="w-full rounded-xl overflow-hidden border border-line-subtle bg-raised">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col className="w-[17%]" />
              <col className="w-[27%]" />
              <col className="w-[38%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr>
                <th className={headerClass}>分类</th>
                <th className={headerClass}>模型</th>
                <th className={headerClass}>价格</th>
                <th className={headerClass}>备注</th>
              </tr>
            </thead>
            <tbody>
              {displayedCategories.map((category) =>
                category.rows.map((row, rowIndex) => (
                  <tr
                    key={`${category.id}-${rowIndex}`}
                    className="hover:bg-wash transition-colors"
                  >
                    {/* 分类列 (首行跨行合并) */}
                    {rowIndex === 0 && (
                      <td
                        className={`${cellClass(true)} align-top font-bold bg-raised/50`}
                        rowSpan={category.rows.length}
                      >
                        <div className="text-[13px] text-ink font-bold tracking-tight">
                          {category.classification}
                        </div>
                        {category.description && (
                          <div className="text-[11px] text-ink-muted mt-1 font-normal">
                            {category.description}
                          </div>
                        )}
                      </td>
                    )}

                    {/* 模型列 */}
                    <td className={`${cellClass(rowIndex === 0)} font-medium text-ink text-[13px]`}>
                      {row.model}
                    </td>

                    {/* 价格列 */}
                    <td className={`${cellClass(rowIndex === 0)} leading-relaxed text-ink text-[12px]`}>
                      <div className="whitespace-normal break-words">{row.price}</div>
                    </td>

                    {/* 备注列 (首行跨行合并) */}
                    {rowIndex === 0 && (
                      <td
                        className={`${cellClass(true)} align-top text-ink-muted bg-raised/30 text-[12px] leading-relaxed`}
                        rowSpan={category.rows.length}
                      >
                        {category.note || '-'}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
