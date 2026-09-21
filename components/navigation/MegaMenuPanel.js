import React from 'react';
import NavBadge from './NavBadge';
import NavIcon from './NavIcon';

/**
 * 双栏 Mega Menu 浮层内容面板组件 (严格遵循 UI_DESIGN_SYSTEM.md 规范)
 * 
 * @param {Object} props
 * @param {Object} props.category 当前选中的分类数据 (包含 features 和 models)
 * @param {string} props.locale 语言代码 ('zh' | 'en')
 * @param {Function} props.onItemClick 点击条目时的回调
 */
export default function MegaMenuPanel({ category, locale = 'zh', onItemClick }) {
  if (!category) return null;

  const isZh = locale?.startsWith('zh') ?? true;
  const hasModels = Array.isArray(category.models) && category.models.length > 0;

  return (
    <div className="w-screen max-w-3xl overflow-hidden rounded-2xl border border-line bg-overlay-glass text-ink shadow-elevation-3 backdrop-blur-md">
      <div className="flex flex-col divide-y divide-line md:flex-row md:divide-x md:divide-y-0">
        
        {/* 左栏：Features (功能与工具) */}
        <div className={`${hasModels ? 'w-full md:w-1/2' : 'w-full'} flex flex-col p-3`}>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-caption font-bold uppercase tracking-wider text-ink-muted">
              {isZh ? '功能与工具' : 'Features'}
            </span>
          </div>

          <div className="mt-1 space-y-1 overflow-y-auto max-h-96 pr-1 scrollbar-rail">
            {category.features?.map((feat) => {
              const label = typeof feat.label === 'object' ? (feat.label[isZh ? 'zh' : 'en'] || feat.label.en) : feat.label;
              const desc = typeof feat.description === 'object' ? (feat.description[isZh ? 'zh' : 'en'] || feat.description.en) : feat.description;

              return (
                <a
                  key={feat.id}
                  href={feat.href}
                  onClick={(e) => onItemClick?.(e, feat)}
                  className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors duration-fast hover:bg-wash-strong"
                >
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-wash text-ink-muted transition-colors duration-fast group-hover:border-line-strong group-hover:bg-wash-strong group-hover:text-ink">
                    <NavIcon name={feat.icon} className="size-4" />
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-body-sm font-semibold text-ink">
                        {label}
                      </span>
                      {feat.badge && <NavBadge badge={feat.badge} />}
                    </div>
                    {desc && (
                      <p className="mt-0.5 truncate text-caption text-ink-subtle group-hover:text-ink-muted">
                        {desc}
                      </p>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        {/* 右栏：Models (模型矩阵) */}
        {hasModels && (
          <div className="w-full md:w-1/2 flex flex-col p-3 bg-wash">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-caption font-bold uppercase tracking-wider text-ink-muted">
                {isZh ? '核心模型矩阵' : 'Models'}
              </span>
              <span className="text-micro text-ink-subtle">
                {category.models.length} {isZh ? '款就绪' : 'Ready'}
              </span>
            </div>

            <div className="mt-1 space-y-1 overflow-y-auto max-h-96 pr-1 scrollbar-rail">
              {category.models.map((model) => {
                const desc = typeof model.description === 'object' ? (model.description[isZh ? 'zh' : 'en'] || model.description.en) : model.description;

                return (
                  <a
                    key={model.id}
                    href={model.href}
                    onClick={(e) => onItemClick?.(e, model)}
                    className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors duration-fast hover:bg-wash-strong"
                  >
                    <NavIcon isModel className="size-4" />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-body-sm font-semibold text-ink">
                          {model.name}
                        </span>
                        {model.badge && <NavBadge badge={model.badge} />}
                      </div>
                      {desc && (
                        <p className="mt-0.5 line-clamp-1 text-caption text-ink-subtle group-hover:text-ink-muted">
                          {desc}
                        </p>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
