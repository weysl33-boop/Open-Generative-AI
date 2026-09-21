/**
 * 高性能、零依赖且完全兼容 clsx 与 Tailwind 的类名合并工具 (cn)
 * 支持字符串、数组嵌套、对象键值条件判断，彻底杜绝外部 ESM/CJS 打包不兼容风险
 */
export function cn(...inputs) {
  const classes = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string' || typeof input === 'number') {
      classes.push(input);
    } else if (Array.isArray(input)) {
      const inner = cn(...input);
      if (inner) classes.push(inner);
    } else if (typeof input === 'object') {
      for (const key in input) {
        if (input[key]) classes.push(key);
      }
    }
  }
  return classes.join(' ');
}

export default cn;
