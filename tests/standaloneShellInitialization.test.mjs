import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('StandaloneShell declares pushNotification before using it in the remix effect', async () => {
  const source = await readFile(new URL('../components/StandaloneShell.js', import.meta.url), 'utf8');
  const declaration = source.indexOf('const pushNotification = useCallback');
  const remixEffectDependency = source.indexOf('}, [activeTab, pushNotification]);');

  assert.notEqual(declaration, -1, 'pushNotification declaration must exist');
  assert.notEqual(remixEffectDependency, -1, 'remix effect dependency must exist');
  assert.ok(
    declaration < remixEffectDependency,
    'pushNotification must be initialized before the remix effect is evaluated',
  );
});
