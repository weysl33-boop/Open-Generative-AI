#!/usr/bin/env bash
set -e

WEB_DIR="/home/wwwroot/AI/domain/koyosim.com/web"
echo "[1/6] 解压更新源码至 $WEB_DIR..."
tar -xzf /home/ubuntu/source_koyosim_update.tar.gz -C "$WEB_DIR"
rm -f "$WEB_DIR/app/studio/[[...slug]]/error.js"

echo "[2/6] 解压新Next.js生产产物..."
rm -rf "$WEB_DIR/.next-new"
mkdir -p "$WEB_DIR/.next-new"
tar -xzf /home/ubuntu/next_koyosim_dist.tar.gz -C "$WEB_DIR/.next-new" --strip-components=1
if [ -d "$WEB_DIR/.next-new/.next" ]; then
  cp -a "$WEB_DIR/.next-new/.next/"* "$WEB_DIR/.next-new/" 2>/dev/null || true
  cp -a "$WEB_DIR/.next-new/.next/."* "$WEB_DIR/.next-new/" 2>/dev/null || true
  rm -rf "$WEB_DIR/.next-new/.next"
fi

if [ ! -f "$WEB_DIR/.next-new/BUILD_ID" ]; then
  echo "ERROR: BUILD_ID not found in .next-new!"
  exit 1
fi
echo "BUILD_ID: $(cat "$WEB_DIR/.next-new/BUILD_ID")"

echo "[3/6] 合并历史静态Chunks资产并原子替换 .next 目录..."
if [ -d "$WEB_DIR/.next/static" ] && [ -d "$WEB_DIR/.next-new/static" ]; then
  echo "保留上一版本静态 chunks 资产以保障在线用户平滑无缝访问..."
  cp -rn "$WEB_DIR/.next/static/"* "$WEB_DIR/.next-new/static/" 2>/dev/null || true
fi
rm -rf "$WEB_DIR/.next-previous"
if [ -d "$WEB_DIR/.next" ]; then
  mv "$WEB_DIR/.next" "$WEB_DIR/.next-previous"
fi
mv "$WEB_DIR/.next-new" "$WEB_DIR/.next"

echo "[4/6] 修复文件所有权为 www:www 并确保 uploads 目录..."
mkdir -p "$WEB_DIR/public/uploads/branding"
chown -R www:www "$WEB_DIR/public/uploads" "$WEB_DIR/app" "$WEB_DIR/components" "$WEB_DIR/lib" "$WEB_DIR/messages" "$WEB_DIR/packages" "$WEB_DIR/scripts" "$WEB_DIR/.next" "$WEB_DIR/package.json" "$WEB_DIR/tailwind.config.js" "$WEB_DIR/index.html" "$WEB_DIR/middleware.js" "$WEB_DIR/next.config.mjs" 2>/dev/null || true

echo "[5/6] 更新 systemd 服务描述并重载..."
sed -i 's/Open Generative AI (koyosim.com)/koyosim (koyosim.com)/g' /etc/systemd/system/koyosim.service
sed -i 's/Open Generative AI Worker (koyosim.com)/koyosim Worker (koyosim.com)/g' /etc/systemd/system/koyosim-worker.service
systemctl daemon-reload

echo "[6/6] 重启 koyosim.service 与 koyosim-worker.service..."
systemctl restart koyosim.service
systemctl restart koyosim-worker.service

echo "SUCCESS: Deployment and restart completed."
