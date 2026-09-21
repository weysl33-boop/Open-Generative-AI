import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const targetDirs = [
  path.join(projectRoot, 'app'),
  path.join(projectRoot, 'components'),
  path.join(projectRoot, 'packages', 'studio', 'src'),
];

const fileExtensions = ['.js', '.jsx', '.ts', '.tsx'];

const findings = {
  hardcodedHex: new Map(),
  arbitraryPx: new Map(),
  arbitraryRounded: new Map(),
  arbitraryShadows: new Map(),
  arbitraryZIndex: new Map(),
  handcraftedSvgCount: 0,
  colorUsages: {
    cyan: 0,
    blue: 0,
    purple: 0,
    emerald: 0,
    zinc: 0,
    gray: 0,
    neutral: 0,
    slate: 0,
  },
  filesScanned: 0,
};

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', 'dist', '.git'].includes(entry.name)) {
        walkDir(fullPath);
      }
    } else if (entry.isFile() && fileExtensions.includes(path.extname(entry.name))) {
      scanFile(fullPath);
    }
  }
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  findings.filesScanned++;

  const hexMatches = content.match(/#[0-9a-fA-F]{3,8}/g) || [];
  for (const hex of hexMatches) {
    const lower = hex.toLowerCase();
    findings.hardcodedHex.set(lower, (findings.hardcodedHex.get(lower) || 0) + 1);
  }

  const pxMatches = content.match(/(?:h|w|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap)-\[[0-9]+px\]/g) || [];
  for (const px of pxMatches) {
    findings.arbitraryPx.set(px, (findings.arbitraryPx.get(px) || 0) + 1);
  }

  const roundedMatches = content.match(/rounded-\[[^\]]+\]/g) || [];
  for (const r of roundedMatches) {
    findings.arbitraryRounded.set(r, (findings.arbitraryRounded.get(r) || 0) + 1);
  }

  const shadowMatches = content.match(/shadow-\[[^\]]+\]/g) || [];
  for (const s of shadowMatches) {
    findings.arbitraryShadows.set(s, (findings.arbitraryShadows.get(s) || 0) + 1);
  }

  const zMatches = content.match(/z-(?:\[[0-9]+\]|[0-9]{2,})/g) || [];
  for (const z of zMatches) {
    findings.arbitraryZIndex.set(z, (findings.arbitraryZIndex.get(z) || 0) + 1);
  }

  const svgMatches = content.match(/<svg[\s\S]*?<\/svg>/g) || [];
  findings.handcraftedSvgCount += svgMatches.length;

  for (const color of Object.keys(findings.colorUsages)) {
    const re = new RegExp('(?:text|bg|border|ring|from|to|via)-' + color + '-\\d+', 'g');
    const matches = content.match(re) || [];
    findings.colorUsages[color] += matches.length;
  }
}

for (const d of targetDirs) {
  walkDir(d);
}

const topHex = Array.from(findings.hardcodedHex.entries()).sort((a, b) => b[1] - a[1]).slice(0, 50);
const topPx = Array.from(findings.arbitraryPx.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40);
const topRounded = Array.from(findings.arbitraryRounded.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30);
const topShadows = Array.from(findings.arbitraryShadows.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30);
const topZ = Array.from(findings.arbitraryZIndex.entries()).sort((a, b) => b[1] - a[1]);

const result = {
  filesScanned: findings.filesScanned,
  handcraftedSvgCount: findings.handcraftedSvgCount,
  colorUsages: findings.colorUsages,
  topHex,
  topPx,
  topRounded,
  topShadows,
  topZ,
};

fs.writeFileSync(path.join(projectRoot, 'source_ui_audit_result.json'), JSON.stringify(result, null, 2));
console.log('Source UI Audit completed successfully. Files scanned:', findings.filesScanned);
