# 이미지 스튜디오 열기(바탕화면 바로 가기가 부름) — 도우미 켜기 → 대장 창 · 미리보기 창 열기
# PC2-스튜디오-1(11-20): 창이 저절로 안 열리던 문제
#  - 켜졌는지 확인을 127.0.0.1로 · 프록시 안 거치게(회사 · 백신 프록시가 localhost를 붙잡으면 확인이 매번 2초씩 멈춤)
#  - 창은 Edge → Chrome 앱 창(주소창 없는 창)으로 열고 · 둘 다 없으면 기본 브라우저
#  - 무엇을 하는지 이 창에 보여 주고 · 문제가 있으면 멈춰서 알려 줌(그냥 닫히지 않음)
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
$base = 'http://127.0.0.1:4300'      # 켜졌는지 확인용(프록시 · IPv6 안 거침)
$open = 'http://localhost:4300'      # 창 주소는 localhost 그대로(사본 창과 신호 주고받는 출처가 localhost:4300)
function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }
function IsUp {
  try {
    $req = [System.Net.HttpWebRequest]::Create("$base/api/status")
    $req.Proxy = $null; $req.Timeout = 1000
    $res = $req.GetResponse(); $ok = [int]$res.StatusCode -eq 200; $res.Close(); return $ok
  } catch { return $false }
}
function FindBrowser {
  $c = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  )
  foreach ($p in $c) { if ($p -and (Test-Path $p)) { return $p } }
  return $null
}
function OpenWindow($url, $size) {
  $b = FindBrowser
  if ($b) {
    try { Start-Process -FilePath $b -ArgumentList "--new-window --app=$url --window-size=$size"; return } catch { }
  }
  Start-Process $url   # 기본 브라우저
}

Say 'eereum 이미지 스튜디오 여는 중…' 'Cyan'
if ($WithDb) {
  # 내장 DB를 켜는데 방화벽 규칙이 없으면 여기서 한 번 더 만들어 봄(관리자 허락 1번) · 없어도 스튜디오는 열림(대장에 경고)
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'db-firewall.ps1') -Quiet | Out-Host
}
if (IsUp) { Say '  도우미 이미 켜져 있음 → 창만 엶' }
else {
  Say '  도우미 켜는 중(작은 검은 창 · 닫지 마세요)…'
  Start-Process -FilePath 'node' -ArgumentList 'server/index.mjs' -WorkingDirectory $studio -WindowStyle Minimized
  $up = $false
  for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; if (IsUp) { $up = $true; break } }
  if (-not $up) {
    Say '  도우미가 30초 안에 켜지지 않았어요. 작업 표시줄의 작은 검은 창(node)에 빨간 글자가 있으면 그 화면을 PC2에게 보내 주세요.' 'Red'
    Read-Host '  Enter를 누르면 닫혀요'
    exit 1
  }
}
Say '  대장 창 · 미리보기 창 열기' 'Green'
OpenWindow "$open/register" '1440,900'
Start-Sleep -Milliseconds 400
OpenWindow "$open/preview" '1440,900'
Start-Sleep -Seconds 2   # 창이 뜨는 동안 잠깐 보여 주고 닫힘
