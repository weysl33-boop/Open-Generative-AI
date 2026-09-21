/**
 * Adoption census for the shared UI layer.
 *
 * docs/UI_COMPONENTS.md §0.2 publishes "how many files actually use each
 * primitive family". That number is the acceptance evidence for PART 33
 * ("buttons / forms / dropdowns / modals unified"), so it has to be
 * reproducible rather than hand-counted — a hand-counted table silently
 * changes methodology every time it is refreshed, which is how the previous
 * one drifted.
 *
 * Method: a file counts as a consumer when an `import { … } from "<…>/ui…"`
 * statement names at least one export of that family. Alias re-exports inside
 * `components/ui/*` are excluded, because they are the compatibility shell, not
 * usage. `--packages` prints only the consumers that live inside `packages/*`,
 * i.e. the studio/agent/workflow islands the migration still has to reach.
 *
 *   node scripts/ui-adoption.mjs            # table + totals
 *   node scripts/ui-adoption.mjs --list     # also print the packages-side files
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKIP = new Set(['node_modules', '.git', '.agents', 'dist', '.next', 'release-staging', 'coverage', '.qoder']);
const EXT = /\.(js|jsx|mjs|cjs)$/;
const ALIAS_SHELL = /^components[\\/]ui[\\/]/;

const FAMILIES = {
  Button: ['Button', 'IconButton'],
  Badge: ['Badge', 'StatusBadge'],
  Card: ['Card', 'CardHeader', 'CardMedia'],
  Select: ['Select', 'SelectGroup', 'SelectLabel', 'SelectItem', 'SelectTrigger', 'SelectContent', 'SelectValue'],
  Overlay: ['Modal', 'ModalContent', 'ModalFooter', 'Drawer', 'DrawerContent', 'Popover', 'Tooltip', 'Menu'],
  Tabs: ['Tabs', 'TabsList', 'TabsTrigger', 'TabsContent', 'SegmentedControl'],
  Field: ['Input', 'Textarea', 'Label', 'FieldMessage', 'Switch'],
  Feedback: ['Spinner', 'Skeleton', 'Progress', 'Alert', 'EmptyState', 'ToastHost'],
};

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name) || entry.name.startsWith('.next-')) continue;
      walk(full);
    } else if (EXT.test(entry.name)) {
      files.push(path.relative(ROOT, full));
    }
  }
})(ROOT);

const perFamily = new Map(Object.keys(FAMILIES).map((k) => [k, new Set()]));
const consumers = new Set();
const packagesConsumers = new Set();

for (const rel of files) {
  if (ALIAS_SHELL.test(rel)) continue;
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/import\s*(?:type\s*)?{([^}]*)}\s*from\s*["']([^"']+)["']/g)) {
    if (!/(^|[\\/])ui([\\/]|$)|\bstudio$/.test(m[2])) continue;
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0];
      if (name) names.add(name);
    }
  }
  if (!names.size) continue;
  consumers.add(rel);
  if (rel.startsWith('packages')) packagesConsumers.add(rel);
  for (const [family, list] of Object.entries(FAMILIES)) {
    if (list.some((n) => names.has(n))) perFamily.get(family).add(rel);
  }
}

for (const [family, set] of perFamily) {
  console.log(`${family.padEnd(9)} ${String(set.size).padStart(4)}`);
}
console.log(`\nscanned ${files.length} source files; ${consumers.size} consume the ui layer; ${packagesConsumers.size} of them inside packages/.`);
if (process.argv.includes('--list')) for (const f of packagesConsumers) console.log('  ', f);
