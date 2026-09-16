$wc = New-Object System.Net.WebClient
$wc.Proxy = [System.Net.GlobalProxySelection]::GetEmptyWebProxy()
$json = $wc.DownloadString("http://127.0.0.1:9222/json/version")
Write-Host "RESULT:" $json
