import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BUILTIN_COMMUNITY_CASES } from '../lib/community/builtinCases.js';
import { closePgPool } from '../lib/db/pg.js';
import {
  listCommunityPosts,
  getCommunityPostById,
  getPostCoinStatus,
} from '../lib/services/community.js';

test('1. 验证即梦 Beer 海报案例及精选案例集数据完整性', () => {
  assert.ok(BUILTIN_COMMUNITY_CASES.length >= 8, '内置精选案例库数量应不少于 8 条');

  const targetCase = BUILTIN_COMMUNITY_CASES.find(
    (c) => String(c.id) === '7681561564197031193'
  );
  assert.ok(targetCase, '必须包含指定 ID 7681561564197031193 的即梦海报案例');
  assert.equal(targetCase.title, '竖版啤酒艺术海报');
  assert.equal(targetCase.model_name, 'Seedream 5.0 Pro');
  assert.equal(targetCase.aspect_ratio, '3:4');
  assert.ok(targetCase.prompt.includes('龍星麦酒'), '提示词中需包含品牌与构图详情');
  assert.ok(targetCase.prompt.includes('@image1'), '提示词中需包含智能参考图标记');
  assert.equal(
    targetCase.parameters?.reference_image,
    '/assets/community/case-beer-ref-can.webp'
  );
  assert.equal(targetCase.parameters?.reference_type, '智能参考');
  assert.ok(targetCase.tags.includes('智能参考'));
  assert.ok(targetCase.tags.includes('潮流海报'));
});

test('2. 验证作品静态媒体资源在 public/assets/ 目录下实体存在', () => {
  const root = process.cwd();
  const posterPath = path.join(root, 'public', 'assets', 'community', 'case-beer-poster.webp');
  const refCanPath = path.join(root, 'public', 'assets', 'community', 'case-beer-ref-can.webp');

  assert.ok(fs.existsSync(posterPath), 'case-beer-poster.webp 必须真实存在于 public 目录');
  assert.ok(fs.statSync(posterPath).size > 1000, '海报图像大小需大于 1KB');

  assert.ok(fs.existsSync(refCanPath), 'case-beer-ref-can.webp 必须真实存在于 public 目录');
  assert.ok(fs.statSync(refCanPath).size > 1000, '智能参考图大小需大于 1KB');
});

test('3. 服务层 listCommunityPosts 检索与分类机制正常', async () => {
  const allPosts = await listCommunityPosts({ category: 'all' });
  assert.ok(allPosts.length >= 8, '默认探索列表应包含案例库所有可用条目');

  const imagePosts = await listCommunityPosts({ category: 'image' });
  assert.ok(imagePosts.length > 0, 'AI 绘画分类应包含案例');
  imagePosts.forEach((p) => {
    assert.equal(p.media_type, 'image');
  });

  const searchResults = await listCommunityPosts({ q: '啤酒' });
  assert.ok(searchResults.some((p) => String(p.id) === '7681561564197031193'));
});

test('4. 服务层 getCommunityPostById 准确返回目标案例与参数', async () => {
  const post = await getCommunityPostById('7681561564197031193');
  assert.ok(post, '根据即梦真实 ID 必须能直接查出作品');
  assert.equal(post.title, '竖版啤酒艺术海报');
  assert.equal(post.model_name, 'Seedream 5.0 Pro');
  assert.equal(post.parameters?.steps, 32);
  assert.equal(post.parameters?.cfg_scale, 7.5);
  assert.equal(post.parameters?.seed, 7681561564);
});

test('5. 投币硬币状态查询在案例上平稳降级生效', async () => {
  const coinStatus = await getPostCoinStatus('7681561564197031193', null);
  assert.ok(coinStatus, '作品投币状态需可读');
  assert.equal(typeof coinStatus.post?.coins_count, 'number');
  await closePgPool();
});
