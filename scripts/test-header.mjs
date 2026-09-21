async function test() {
  const headers = {
    'Host': 'www.koyosim.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Referer': 'https://www.koyosim.com/admin',
    'Sec-Fetch-Dest': 'script',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'same-origin',
    'Cookie': 'ko_session=pd22H1-ceVCTMe5KHcbSHAEeqWF821_3hbWUBDMBIxk'
  };
  
  // 1. 测试直接到 3100
  const res1 = await fetch('http://127.0.0.1:3100/_next/static/chunks/webpack-8e91c46aa758f94e.js', { headers });
  console.log('Direct 3100 status:', res1.status);
  
  // 2. 测试通过 Nginx 443
  const res2 = await fetch('https://www.koyosim.com/_next/static/chunks/webpack-8e91c46aa758f94e.js', { headers });
  console.log('Nginx HTTPS status:', res2.status);
  const text = await res2.text();
  console.log('Body preview:', text.slice(0, 150));
}
test().catch(console.error);
