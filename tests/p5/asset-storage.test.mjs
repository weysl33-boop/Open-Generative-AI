import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { persistCreationResult } from '../../lib/storage/assetStorage.js';

test('persistCreationResult passes through relative or data urls', async () => {
  assert.equal(await persistCreationResult({ url: '/local/path/1.png' }), '/local/path/1.png');
  assert.equal(await persistCreationResult({ url: 'data:image/png;base64,123' }), 'data:image/png;base64,123');
  assert.equal(await persistCreationResult({ url: '' }), '');
  assert.equal(await persistCreationResult({ url: null }), null);
});

test('persistCreationResult falls back on non-existent or failing host', async () => {
  const badUrl = 'http://127.0.0.1:59999/not-exist.png';
  const result = await persistCreationResult({ url: badUrl, timeoutMs: 500 });
  assert.equal(result, badUrl);
});

test('persistCreationResult downloads valid media and writes to local directory', async () => {
  // 创建临时本地 HTTP 服务模拟上游 CDN
  const fakePng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    ...new Array(100).fill(0x00),
  ]);

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(fakePng);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mockUrl = `http://127.0.0.1:${port}/generated-image.png`;

  try {
    const savedPath = await persistCreationResult({
      url: mockUrl,
      creationId: 'test_cre_12345',
      mediaType: 'image',
    });

    assert.match(savedPath, /^\/uploads\/creations\/\d{6}\/test_cre_12345\.png$/);
    const diskPath = path.join(process.cwd(), 'public', savedPath.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), 'Downloaded file must exist on disk');
    const content = fs.readFileSync(diskPath);
    assert.equal(content.length, fakePng.length);
    // 清理测试产物
    fs.unlinkSync(diskPath);
  } finally {
    server.close();
  }
});
