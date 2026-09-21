import fs from 'node:fs';

/**
 * 读取内联密钥或密钥文件：微信/支付宝既支持把 PEM 直接塞进环境变量，也支持只给路径。
 * 可用性判定与 Provider 必须走同一份读取逻辑，否则用 _PATH 部署的商户会被判成"未配置"，
 * 前端选不到渠道、下单直接 503，而 Provider 自己其实能签名。
 */
export function readKeyOrPath(inlineValue, pathValue, sourceLabel) {
  if (inlineValue && String(inlineValue).trim()) return String(inlineValue).trim();
  if (pathValue && String(pathValue).trim()) {
    const trimmedPath = String(pathValue).trim();
    try {
      if (fs.existsSync(trimmedPath)) return fs.readFileSync(trimmedPath, 'utf8');
    } catch (error) {
      console.warn(`[${sourceLabel}] 读取密钥文件失败:`, trimmedPath, error.message);
    }
  }
  return null;
}
