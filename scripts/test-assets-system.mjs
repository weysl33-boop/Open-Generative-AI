import assert from 'node:assert';
import { execute, nowIso, query, randomId } from '../lib/db/index.js';
import { assertSandboxDatabase } from './require-sandbox-db.mjs';
import { reserveTestUserId } from './test-user-id-fixtures.mjs';
import { createSession } from '../lib/services/auth.js';
import {
  getUserAssetFolders,
  createUserAssetFolder,
  updateUserAssetFolder,
  deleteUserAssetFolder,
  getUserAssets,
  batchMoveUserAssets,
  deleteUserAsset,
} from '../lib/services/assets.js';

console.log('=== [开始「我的资产库」全链路端到端自动化测试] ===\n');

const BASE_URL = 'http://127.0.0.1:3100';
const ORIGIN = 'https://www.koyosim.com';

async function main() {
  await assertSandboxDatabase();
  const testUserId = await reserveTestUserId(query);
  const now = nowIso();

  try {
    // 0. 创建临时测试用户及有效会话
    await execute(
      `INSERT INTO auth_usr.users (id, email, display_name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [testUserId, `${testUserId}@example.com`, 'Asset Test User', 'user', now, now]
    );
    const session = await createSession(testUserId);
    const token = session.token;
    console.log('✓ 1. 测试用户及会话初始化成功');

    // 1. 服务层测试：创建一级目录
    const folderLevel1 = await createUserAssetFolder(testUserId, {
      name: '项目A_商业海报',
      color: '#22d3ee',
      icon: 'folder',
    });
    assert.strictEqual(folderLevel1.name, '项目A_商业海报');
    assert.strictEqual(folderLevel1.depth, 1);
    assert.strictEqual(folderLevel1.parent_id, null);
    console.log('✓ 2. 一级文件夹创建成功 (depth=1)');

    // 2. 服务层测试：创建二级子目录
    const folderLevel2 = await createUserAssetFolder(testUserId, {
      name: '初版线稿',
      parentId: folderLevel1.id,
      color: '#a855f7',
      icon: 'image',
    });
    assert.strictEqual(folderLevel2.name, '初版线稿');
    assert.strictEqual(folderLevel2.depth, 2);
    assert.strictEqual(folderLevel2.parent_id, folderLevel1.id);
    console.log('✓ 3. 二级子文件夹创建成功 (depth=2)');

    // 3. 服务层深度约束测试：禁止创建超过两级的子文件夹
    let depthExceededCaught = false;
    try {
      await createUserAssetFolder(testUserId, {
        name: '三级越界目录',
        parentId: folderLevel2.id,
      });
    } catch (err) {
      if (err.code === 'FOLDER_DEPTH_EXCEEDED') {
        depthExceededCaught = true;
      }
    }
    assert.strictEqual(depthExceededCaught, true, '必须拦截超过2级的文件夹创建');
    console.log('✓ 4. 两级子文件夹上限约束生效 (拦截三级越界)');

    // 4. 服务层测试：同级重名防护
    let duplicateCaught = false;
    try {
      await createUserAssetFolder(testUserId, {
        name: '初版线稿',
        parentId: folderLevel1.id,
      });
    } catch (err) {
      if (err.code === 'FOLDER_NAME_DUPLICATE') {
        duplicateCaught = true;
      }
    }
    assert.strictEqual(duplicateCaught, true, '同级下同名文件夹应被拦截');
    console.log('✓ 5. 同级文件夹重名防重约束生效');

    // 5. 树形结构查询测试
    const treeData = await getUserAssetFolders(testUserId);
    assert.strictEqual(treeData.folderTree.length, 1);
    assert.strictEqual(treeData.folderTree[0].name, '项目A_商业海报');
    assert.strictEqual(treeData.folderTree[0].children.length, 1);
    assert.strictEqual(treeData.folderTree[0].children[0].name, '初版线稿');
    console.log('✓ 6. 两级文件夹嵌套树形构建正确');

    // 6. 插入测试资产记录
    const assetId1 = `ast_test_1_${Date.now()}`;
    const assetId2 = `ast_test_2_${Date.now()}`;
    await execute(
      `INSERT INTO ai_studio.user_assets (
        id, user_id, asset_type, prompt, model_name, media_url, folder_id, is_favorite, created_at, updated_at
      ) VALUES
      ($1, $2, 'image', 'cyberpunk city neon rain', 'Flux.1 Schnell', 'https://example.com/1.png', $3, false, $4, $4),
      ($5, $2, 'video', 'futuristic spaceship hyperdrive', 'Kling 1.5', 'https://example.com/2.mp4', NULL, true, $4, $4)`,
      [assetId1, testUserId, folderLevel2.id, now, assetId2]
    );
    console.log('✓ 7. 测试素材资产入库成功');

    // 7. 资产列表与多维检索过滤测试
    const listAll = await getUserAssets(testUserId, { type: 'all' });
    assert.strictEqual(listAll.total, 2);

    const listImages = await getUserAssets(testUserId, { type: 'image' });
    assert.strictEqual(listImages.total, 1);
    assert.strictEqual(listImages.assets[0].prompt, 'cyberpunk city neon rain');

    const listFolder2 = await getUserAssets(testUserId, { folderId: folderLevel2.id });
    assert.strictEqual(listFolder2.total, 1);

    const listFavorites = await getUserAssets(testUserId, { favoriteOnly: true });
    assert.strictEqual(listFavorites.total, 1);
    assert.strictEqual(listFavorites.assets[0].asset_type, 'video');
    console.log('✓ 8. 资产列表检索与多维筛选（类型/文件夹/收藏）校验通过');

    // 8. 文件夹安全删除保护测试：删除文件夹后，内部素材自动安全回退至未分类 (folder_id = null)
    await deleteUserAssetFolder(testUserId, folderLevel1.id);
    const afterDeleteFolder = await getUserAssets(testUserId);
    const movedAsset = afterDeleteFolder.assets.find(a => a.id === assetId1);
    assert.strictEqual(movedAsset.folder_id, null, '父文件夹删除后素材必须安全回退至根目录');
    console.log('✓ 9. 文件夹级联删除与素材安全回退保护机制通过');

    // ==========================================
    // 真实 HTTP API 接口集成测试 (监听于 127.0.0.1:3100)
    // ==========================================
    const cookieHeader = `ko_session=${token}`;
    const baseHeaders = {
      'Cookie': cookieHeader,
      'Origin': ORIGIN,
      'Referer': `${ORIGIN}/studio/assets`,
    };

    // 9. API 接口测试：POST /api/assets/folders 创建一级分类文件夹
    const postFolderRes = await fetch(`${BASE_URL}/api/assets/folders`, {
      method: 'POST',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '真实接口文件夹', color: '#10b981' }),
    });
    assert.strictEqual(postFolderRes.status, 201);
    const postFolderJson = await postFolderRes.json();
    const newFolderId = postFolderJson.folder.id;
    console.log('✓ 10. HTTP POST /api/assets/folders 测试通过 (201 Created)');

    // 10. API 接口测试：POST /api/assets/folders 创建二级子文件夹
    const postSubfolderRes = await fetch(`${BASE_URL}/api/assets/folders`, {
      method: 'POST',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '接口二级子文件夹', parentId: newFolderId, color: '#f59e0b' }),
    });
    assert.strictEqual(postSubfolderRes.status, 201);
    const postSubfolderJson = await postSubfolderRes.json();
    const subfolderId = postSubfolderJson.folder.id;
    console.log('✓ 11. HTTP POST /api/assets/folders (二级子文件夹) 测试通过 (201 Created)');

    // 11. API 接口测试：GET /api/assets/folders 获取树形结构
    const getFoldersRes = await fetch(`${BASE_URL}/api/assets/folders`, {
      headers: baseHeaders,
    });
    assert.strictEqual(getFoldersRes.status, 200);
    const getFoldersJson = await getFoldersRes.json();
    const parentInTree = getFoldersJson.folderTree.find(f => f.id === newFolderId);
    assert.ok(parentInTree, '树形列表中必须包含新建的一级目录');
    assert.strictEqual(parentInTree.children[0].id, subfolderId, '子文件夹必须正确嵌套在一级目录下');
    console.log('✓ 12. HTTP GET /api/assets/folders (树形嵌套读取) 测试通过 (200 OK)');

    // 12. API 接口测试：GET /api/assets 检索素材
    const getAssetsRes = await fetch(`${BASE_URL}/api/assets?type=all`, {
      headers: baseHeaders,
    });
    assert.strictEqual(getAssetsRes.status, 200);
    const getAssetsJson = await getAssetsRes.json();
    assert.strictEqual(getAssetsJson.assets.length, 2);
    console.log('✓ 13. HTTP GET /api/assets 测试通过 (200 OK)');

    // 13. API 接口测试：PATCH /api/assets/[id] (单条更新与收藏)
    const patchAssetRes = await fetch(`${BASE_URL}/api/assets/${assetId1}`, {
      method: 'PATCH',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_favorite: true, title: '用户自定义海报标题' }),
    });
    assert.strictEqual(patchAssetRes.status, 200);
    const patchAssetJson = await patchAssetRes.json();
    assert.strictEqual(patchAssetJson.asset.is_favorite, true);
    console.log('✓ 14. HTTP PATCH /api/assets/[id] 测试通过 (200 OK)');

    // 14. API 接口测试：POST /api/assets/batch (批量移动至二级子文件夹)
    const batchMoveRes = await fetch(`${BASE_URL}/api/assets/batch`, {
      method: 'POST',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'move',
        assetIds: [assetId1, assetId2],
        targetFolderId: subfolderId,
      }),
    });
    assert.strictEqual(batchMoveRes.status, 200);
    const batchMoveJson = await batchMoveRes.json();
    assert.strictEqual(batchMoveJson.count, 2);
    console.log('✓ 15. HTTP POST /api/assets/batch (批量移动) 测试通过 (200 OK)');

    // 15. API 接口测试：DELETE /api/assets/folders/[id] (删除二级文件夹)
    const delFolderRes = await fetch(`${BASE_URL}/api/assets/folders/${subfolderId}`, {
      method: 'DELETE',
      headers: baseHeaders,
    });
    assert.strictEqual(delFolderRes.status, 200);
    console.log('✓ 16. HTTP DELETE /api/assets/folders/[id] 测试通过 (200 OK)');

    console.log('\n===============================================================');
    console.log('🎉🎉🎉 「我的资产库」全套数据库约束、服务层、树形目录及 HTTP API 路由全部 100% 验证通过！');
    console.log('===============================================================\n');
  } finally {
    // 清理测试数据 (外键级联删除)
    try {
      await execute(`DELETE FROM auth_usr.users WHERE id = $1`, [testUserId]);
    } catch (cleanupErr) {
      console.warn('清理测试数据忽略警告:', cleanupErr.message);
    }
  }
}

main().catch((err) => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
