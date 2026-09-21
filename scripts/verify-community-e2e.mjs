import assert from 'node:assert/strict';
import { query, queryOne } from '../lib/db/pg.js';
import { assertSandboxDatabase } from './require-sandbox-db.mjs';
import { reserveTestUserId } from './test-user-id-fixtures.mjs';
import {
  createCommunityPost,
  getCommunityPostById,
  listCommunityPosts,
  toggleCommunityLike,
  addCommunityComment,
  listCommunityComments,
  recordRemixCount,
  deleteCommunityPost
} from '../lib/repositories/community.js';

async function main() {
  await assertSandboxDatabase();
  console.log('==================================================');
  console.log('🧪 开始执行用户系统、个人作品与即梦社区 E2E 验证');
  console.log('==================================================');

  // 1. 验证用户表字段
  console.log('[Step 1/6] 验证 auth_usr.users 扩展字段...');
  const userCols = await query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'auth_usr' AND table_name = 'users'
  `);
  const colNames = userCols.rows.map(r => r.column_name);
  assert(colNames.includes('bio'), 'users 表缺少 bio 字段');
  assert(colNames.includes('website'), 'users 表缺少 website 字段');
  console.log('✓ 用户表字段扩展校验通过 (bio, website 等就绪)');

  // 2. 获取或创建测试用户
  let testUser = await queryOne("SELECT id, display_name FROM auth_usr.users LIMIT 1");
  if (!testUser) {
    console.log('未检测到用户，自动创建临时测试用户...');
    const userId = await reserveTestUserId(query);
    testUser = await queryOne(`
      INSERT INTO auth_usr.users (id, email, display_name, role, credits)
      VALUES ($1, 'community_test@koyosim.com', '即梦测试创作者', 'user', 100)
      RETURNING id, display_name
    `, [userId]);
  }
  console.log(`✓ 测试用户就绪: ID=${testUser.id}, 昵称=${testUser.display_name}`);

  // 3. 创建测试作品并发布到社区
  console.log('[Step 2/6] 测试作品发布到社区流程 (createCommunityPost)...');
  const post = await createCommunityPost({
    userId: testUser.id,
    title: '赛博朋克深空探索者 8K',
    description: '使用 Flux 模型生成的高精科幻机甲光影概念图',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe',
    coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe',
    prompt: 'masterpiece, best quality, cyberpunk astronaut exploring distant glowing neon alien planet, 8k resolution',
    modelName: 'flux-schnell',
    parameters: { aspectRatio: '16:9', seed: 428912 },
    tags: ['赛博朋克', '科幻', '8K超写实'],
  });

  assert(post && post.id, '创建社区帖子失败');
  console.log(`✓ 社区帖子创建成功: Post ID=${post.id}, 标题="${post.title}"`);

  // 4. 测试列表检索与排序筛选
  console.log('[Step 3/6] 测试社区作品瀑布流列表检索与筛选 (listCommunityPosts)...');
  const listAll = await listCommunityPosts({ category: 'all', sort: 'trending', limit: 10, viewerId: testUser.id });
  assert(listAll.some(p => p.id === post.id), '未在社区列表中检索到新建帖子');
  
  const searchTag = await listCommunityPosts({ tag: '赛博朋克', limit: 5 });
  assert(searchTag.some(p => p.id === post.id), '标签筛选未命中');
  console.log(`✓ 社区列表与标签筛选正常，当前检索到 ${listAll.length} 条作品`);

  // 5. 测试点赞与取消点赞原子操作
  console.log('[Step 4/6] 测试社区点赞与取消点赞 (toggleCommunityLike)...');
  const likeResult1 = await toggleCommunityLike(post.id, testUser.id);
  assert(likeResult1.isLiked === true, '点赞应为 true');
  assert(likeResult1.likesCount >= 1, '点赞计数应自增');

  const detailAfterLike = await getCommunityPostById(post.id, testUser.id);
  assert(detailAfterLike.is_liked === true, '详情中的 is_liked 应为 true');
  assert(detailAfterLike.likes_count === likeResult1.likesCount, '点赞数应一致');

  const likeResult2 = await toggleCommunityLike(post.id, testUser.id);
  assert(likeResult2.isLiked === false, '二次点赞应取消，返回 false');
  console.log('✓ 点赞与取消点赞原子状态切换验证通过');

  // 6. 测试评论交流
  console.log('[Step 5/6] 测试发表评论与查询评论列表 (addCommunityComment)...');
  const comment = await addCommunityComment({
    postId: post.id,
    userId: testUser.id,
    content: '太酷了！光影细节非常饱满，准备一键做同款试试！',
  });
  assert(comment && comment.id, '评论发表失败');

  const comments = await listCommunityComments(post.id);
  assert(comments.length >= 1 && comments.some(c => c.id === comment.id), '评论列表中未找到发表的内容');
  console.log(`✓ 评论系统验证通过，当前评论数: ${comments.length}`);

  // 7. 测试一键同款计数
  console.log('[Step 6/6] 测试一键做同款计数 (recordRemixCount)...');
  await recordRemixCount(post.id);
  const detailAfterRemix = await getCommunityPostById(post.id);
  assert(detailAfterRemix.remix_count >= 1, 'Remix 计数应自增');
  console.log(`✓ 一键同款计数成功: 当前使用同款次数 = ${detailAfterRemix.remix_count}`);

  // 清理测试数据
  await deleteCommunityPost(post.id, testUser.id);
  console.log('✓ 测试数据清理完毕');

  console.log('==================================================');
  console.log('🎉 恭喜！用户系统、个人作品与即梦社区全部 E2E 校验通过！');
  console.log('==================================================');
}

main().catch(err => {
  console.error('❌ 验证异常:', err);
  process.exit(1);
});
