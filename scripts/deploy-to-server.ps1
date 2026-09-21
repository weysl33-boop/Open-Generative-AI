param(
    [string]$ServerIp = "43.155.166.90",
    [string]$User = "ubuntu"
)

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "🚀 [koyosim Deploy] 启动全自动云端同步部署流水线" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. 查询物理网卡 IP
$localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1).IPAddress
if (-not $localIp) { $localIp = "192.168.3.8" }
Write-Host "[1/6] 本机物理网络绑定 IP: $localIp" -ForegroundColor Green

# 2. 本地执行编译产出
Write-Host "[2/6] 检查本地 Next.js 生产产物..." -ForegroundColor Yellow
if (-not (Test-Path ".next/BUILD_ID")) {
    Write-Host "正在本地编译 Next.js 生产产物..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "本地编译失败，终止部署！" }
} else {
    Write-Host "已检测到最新生产产物 (BUILD_ID: $(Get-Content .next/BUILD_ID))" -ForegroundColor Green
}

# 3. 打包传输包
Write-Host "[3/6] 正在打包生产构建产物与源码增量..." -ForegroundColor Yellow
tar --exclude=".next/cache" -czf next_koyosim_dist.tar.gz .next
tar -czf source_koyosim_update.tar.gz app components lib messages packages/studio scripts package.json tailwind.config.js index.html middleware.js next.config.mjs public

# 4. 上传至服务器
Write-Host "[4/6] 正在通过物理 IP 直连上传部署包到 $User@$ServerIp..." -ForegroundColor Yellow
scp -o BindAddress=$localIp -o StrictHostKeyChecking=no next_koyosim_dist.tar.gz source_koyosim_update.tar.gz scripts/remote-deploy.sh "${User}@${ServerIp}:/home/${User}/"

# 5. 远端执行部署与服务平滑重载
Write-Host "[5/6] 远端执行原子部署并重启 koyosim.service 与 worker..." -ForegroundColor Yellow
ssh -b $localIp -o StrictHostKeyChecking=no "${User}@${ServerIp}" "sudo bash /home/${User}/remote-deploy.sh"

# 6. 线上健康自检
Write-Host "[6/6] 正在验证线上页面实际渲染状态..." -ForegroundColor Yellow
$checkCmd = "echo '=== 检查 / (首页路由分发) ==='; curl -sI -H 'Host: www.koyosim.com' http://127.0.0.1:3100/ | grep -E 'HTTP/|location|x-locale'; echo '=== 检查 /call-api ==='; curl -s -H 'Host: www.koyosim.com' http://127.0.0.1:3100/call-api | grep -o '<title>[^<]*</title>'; echo '=== 检查 /zh/call-api ==='; curl -s -H 'Host: www.koyosim.com' http://127.0.0.1:3100/zh/call-api | grep -o '<title>[^<]*</title>'; echo '=== 检查 /studio ==='; curl -s -H 'Host: www.koyosim.com' http://127.0.0.1:3100/studio | grep -o '<title>[^<]*</title>'"
ssh -b $localIp -o StrictHostKeyChecking=no "${User}@${ServerIp}" $checkCmd

# 清理本地临时压缩包
Remove-Item -Force next_koyosim_dist.tar.gz, source_koyosim_update.tar.gz -ErrorAction SilentlyContinue

Write-Host "==================================================" -ForegroundColor Green
Write-Host "[koyosim Deploy] Deployment completed and verified!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
