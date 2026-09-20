import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// `radix-ui`（以及任何组件库 / 内部 barrel）只转发自己的命名空间，不会带 React 的
// createContext / hooks。写错来源的 import 在 next build 阶段不报错，只在运行时抛
// `x.createContext is not a function`：线上表现为整棵 RSC 树 500，一次命中
// /studio、/community、/pricing。所以这条契约必须由门禁把住。
const { scanReactImports } = await import('../../scripts/check-react-imports.mjs');

test('P0 ui kit takes React APIs from react, not from the component library', () => {
  const { problems } = scanReactImports(['packages/studio', 'components/ui', 'app', 'lib']);
  assert.deepEqual(problems, []);
});

// 自检：一个只会返回 0 的扫描器和没有门禁等价，所以必须证明它能抓到本次的真实事故写法。
test('P0 scanner flags a React API imported from a non-react module', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-import-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'Navigation.jsx'),
      'import { createContext, useContext, Tabs as TabsPrimitive } from "radix-ui";\nconst Ctx = createContext(null);\nexport { Ctx, useContext };\n',
    );
    fs.writeFileSync(path.join(dir, 'Ok.jsx'), 'import { createContext } from "react";\nexport const Ctx = createContext(null);\n');
    const { problems } = scanReactImports([dir], process.cwd());
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /from "radix-ui" -> createContext, useContext/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
