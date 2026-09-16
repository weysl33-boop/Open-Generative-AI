async function verifyAllAssets() {
  const adminUrl = 'https://go.koyosim.com/admin';
  const cookie = 'ko_session=pd22H1-ceVCTMe5KHcbSHAEeqWF821_3hbWUBDMBIxk';
  
  console.log('1. 获取最新 /admin HTML...');
  const res = await fetch(adminUrl, {
    headers: {
      'Cookie': cookie,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });
  
  console.log('HTML Status:', res.status);
  const html = await res.text();
  
  const matches = [...html.matchAll(/href="(\/_next\/static\/[^"]+)"|src="(\/_next\/static\/[^"]+)"/g)]
    .map(m => m[1] || m[2]);
  
  console.log(`共发现 ${matches.length} 个静态静态资源文件引用`);
  
  let failed = 0;
  for (const asset of matches) {
    const fullUrl = `https://go.koyosim.com${asset}`;
    try {
      const assetRes = await fetch(fullUrl);
      if (assetRes.status !== 200) {
        console.error(`[FAIL ${assetRes.status}] ${asset}`);
        failed++;
      }
    } catch (e) {
      console.error(`[ERROR] ${asset}: ${e.message}`);
      failed++;
    }
  }
  
  if (failed === 0) {
    console.log('🎉 校验完成：最新 HTML 中所引用的全部静态资源在服务器上 100% 存在且均为 200 OK！');
  } else {
    console.error(`⚠️ 存在 ${failed} 个失败资源！`);
  }
}

verifyAllAssets().catch(console.error);
