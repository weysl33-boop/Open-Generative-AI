import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const CURRENT_NEXT = path.join(ROOT_DIR, '.next');
const BUILD_NEXT = path.join(ROOT_DIR, '.next-build');
const OLD_NEXT = path.join(ROOT_DIR, '.next-old');
const CURRENT_STATIC = path.join(CURRENT_NEXT, 'static');
const BUILD_STATIC = path.join(BUILD_NEXT, 'static');
const ARCHIVE_DIR = path.join(ROOT_DIR, 'data', 'static_archive');
const MAX_AGE_DAYS = 14;

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

function pruneOldFiles(dir, maxAgeMs) {
  if (!fs.existsSync(dir)) return;
  const now = Date.now();

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pruneOldFiles(fullPath, maxAgeMs);
      try {
        if (fs.readdirSync(fullPath).length === 0) {
          fs.rmdirSync(fullPath);
        }
      } catch {}
    } else {
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
        }
      } catch {}
    }
  }
}

function main() {
  console.log('=== [KoyoSIM Atomic Build] 启动原子独立目录构建流水线 ===');

  // 1. 清理可能残留的构建临时目录
  if (fs.existsSync(BUILD_NEXT)) {
    console.log('[1/5] 清理上一次构建残留的 .next-build 目录...');
    fs.rmSync(BUILD_NEXT, { recursive: true, force: true });
  }

  // 2. 将当前运行中的 static 资产增量备份至归档池
  if (fs.existsSync(CURRENT_STATIC)) {
    console.log('[2/5] 增量归档当前运行版本的静态资产至持久池 (data/static_archive)...');
    copyDirRecursive(CURRENT_STATIC, ARCHIVE_DIR);
  }

  // 3. 在全新的 .next-build 目录执行独立构建 (完全不触碰运行中的 .next，无锁且安全)
  console.log('[3/5] 在独立环境 .next-build 中执行生产构建 (零文件锁)...');
  try {
    execSync('npx next build', {
      stdio: 'inherit',
      env: {
        ...process.env,
        NEXT_DIST_DIR: '.next-build',
      },
    });
  } catch (err) {
    console.error('构建失败！');
    process.exit(1);
  }

  // 4. 将归档池中的历史 chunks 合并进新构建的 static 目录 (多版本共存)
  console.log('[4/5] 合并历史版本静态 chunks 进新构建目录...');
  copyDirRecursive(ARCHIVE_DIR, BUILD_STATIC);
  copyDirRecursive(BUILD_STATIC, ARCHIVE_DIR);
  pruneOldFiles(ARCHIVE_DIR, MAX_AGE_DAYS * 86400000);

  // 5. 毫秒级原子切换目录
  console.log('[5/5] 执行原子目录切换 (.next-build -> .next)...');
  try {
    if (fs.existsSync(OLD_NEXT)) {
      fs.rmSync(OLD_NEXT, { recursive: true, force: true });
    }
    if (fs.existsSync(CURRENT_NEXT)) {
      fs.renameSync(CURRENT_NEXT, OLD_NEXT);
    }
    fs.renameSync(BUILD_NEXT, CURRENT_NEXT);
    if (fs.existsSync(OLD_NEXT)) {
      fs.rmSync(OLD_NEXT, { recursive: true, force: true });
    }
  } catch (e) {
    console.error('原子切换异常:', e.message);
    process.exit(1);
  }

  console.log('🎉 [KoyoSIM Atomic Build] 原子构建与静态合并全部顺利完成！');
}

main();
