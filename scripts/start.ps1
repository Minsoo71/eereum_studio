# 이미지 스튜디오 열기(바탕화면 바로 가기가 부름) — 도우미 켜기 → 대장 창 · 미리보기 창 열기
param(
  [string]$Root = 'D:\eereum_studio',
  [string]$Share = 'D:\Synology Drive VISCOM\eeruem\이미지교체',
  [switch]$WithDb
)
$env:NODE_OPTIONS = '--use-system-ca'
$env:STUDIO_ROOT = $Root
$env:STUDIO_SHARE = $Share
if ($WithDb) { $env:STUDIO_DB = '1' }
$studio = Split-Path -Parent $PSScriptRoot
# 이미 켜져 있으면 창만 엶
$up = $false
try { $up = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:4300/api/status').StatusCode -eq 200 } catch { }
if (-not $up) {
  Start-Process -FilePath 'node' -ArgumentList 'server/index.mjs' -WorkingDirectory $studio -WindowStyle Minimized
  for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 700; try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:4300/api/status').StatusCode -eq 200) { break } } catch { } }
}
Start-Process 'http://localhost:4300/register'
Start-Process 'http://localhost:4300/preview'
