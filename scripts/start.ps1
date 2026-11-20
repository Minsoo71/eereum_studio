# 이미지 스튜디오 열기(바탕화면 바로 가기가 부름) — 도우미 켜기 → 대장 창 · 미리보기 창 열기
# PC2-스튜디오-1(11-20): 창이 저절로 안 열리던 문제
#  - 켜졌는지 확인을 127.0.0.1로 · 프록시 안 거치게(회사 · 백신 프록시가 localhost를 붙잡으면 확인이 매번 2초씩 멈춤)
#  - 창은 Edge → Chrome 앱 창(주소창 없는 창)으로 열고 · 둘 다 없으면 기본 브라우저
#  - 무엇을 하는지 이 창에 보여 주고 · 문제가 있으면 멈춰서 알려 줌(그냥 닫히지 않음)
# PC2-스튜디오-3(PC5 B 고칠 점): 두 창을 나란히(화면 1개 = 왼쪽 반 대장 · 오른쪽 반 미리보기 / 2개 = 화면마다 하나)
#  - Edge는 앱 창 크기를 기억해서 --window-size를 무시함 → 창이 뜬 뒤 제목으로 찾아 자리 · 크기를 직접 맞춤
#  - 다시 누르면 창을 새로 열지 않고 있던 창을 앞으로(없는 창만 새로)
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
$TitleRegister = 'eereum 이미지 스튜디오 · 대장'   # register/index.html <title>
$TitlePreview = '미리보기 · eereum 스튜디오'        # preview/public/index.html <title>
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

# ── 창 찾기 · 옮기기(Windows 창 기능 · 이 PowerShell 창 안에서만) ──
$winOk = $true
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -TypeDefinition @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class StudioWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public static IntPtr[] Find(string part) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { if (IsWindowVisible(h)) { var sb = new StringBuilder(512); GetWindowText(h, sb, 512); if (sb.ToString().Contains(part)) list.Add(h); } return true; }, IntPtr.Zero);
    return list.ToArray();
  }
}
'@
  [void][StudioWin]::SetProcessDPIAware()   # 화면 크기 · 창 자리를 같은 실제 픽셀로
} catch { $winOk = $false }

# 두 창 자리: 화면 2개 이상 = 주 화면에 대장 · 다른 화면에 미리보기(각 화면 꽉) · 1개 = 왼쪽 반 · 오른쪽 반
function Layout {
  if (-not $winOk) { return $null }
  $screens = [System.Windows.Forms.Screen]::AllScreens
  $main = ([System.Windows.Forms.Screen]::PrimaryScreen).WorkingArea
  $other = $screens | Where-Object { -not $_.Primary } | Select-Object -First 1
  if ($other) {
    $o = $other.WorkingArea
    return @{ register = @($main.X, $main.Y, $main.Width, $main.Height); preview = @($o.X, $o.Y, $o.Width, $o.Height) }
  }
  $half = [int][Math]::Floor($main.Width / 2)
  return @{ register = @($main.X, $main.Y, $half, $main.Height); preview = @(($main.X + $half), $main.Y, ($main.Width - $half), $main.Height) }
}
function FindWin($title) { if (-not $winOk) { return $null }; $w = [StudioWin]::Find($title); if ($w.Count) { return $w[0] } else { return $null } }
function Place($h, $r) {
  if (-not $h -or -not $r) { return }
  [void][StudioWin]::ShowWindow($h, 9)   # 9 = 최소화 · 최대화 풀기
  [void][StudioWin]::MoveWindow($h, $r[0], $r[1], $r[2], $r[3], $true)
}
function OpenWindow($url, $r) {
  $b = FindBrowser
  if ($b) {
    $pos = if ($r) { "--window-position=$($r[0]),$($r[1]) --window-size=$($r[2]),$($r[3])" } else { '--window-size=1440,900' }
    try { Start-Process -FilePath $b -ArgumentList "--new-window --app=$url $pos"; return } catch { }
  }
  Start-Process $url   # 기본 브라우저
}

Say 'eereum 이미지 스튜디오 여는 중…' 'Cyan'
# -WithDb(옛 바로 가기)면 도우미가 데이터 화면도 켬 · 방화벽 규칙 확인 · 처음 한 번만 관리자 허락은 도우미가 db-firewall.ps1로(PC2-스튜디오-2 R-1b)
# 새 바로 가기는 -WithDb 없이 → 대장 "데이터 화면 켜기" 단추
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
$lay = Layout
$wins = @(@{ title = $TitleRegister; url = "$open/register"; rect = $lay.register }, @{ title = $TitlePreview; url = "$open/preview"; rect = $lay.preview })
$opened = 0
foreach ($w in $wins) {
  $h = FindWin $w.title
  if ($h) { Say "  이미 열린 창을 앞으로: $($w.title)" }
  else { OpenWindow $w.url $w.rect; $opened++; Start-Sleep -Milliseconds 400 }
}
if ($opened) { Say "  창 $($opened)개 열기" 'Green' }
# 창이 뜰 때까지(최대 15초) 기다렸다가 나란히 놓고 앞으로
for ($i = 0; $i -lt 30; $i++) {
  if ((FindWin $TitleRegister) -and (FindWin $TitlePreview)) { break }
  Start-Sleep -Milliseconds 500
}
foreach ($w in $wins) {
  $h = FindWin $w.title
  if ($h) { Place $h $w.rect; [void][StudioWin]::SetForegroundWindow($h) }
}
Start-Sleep -Seconds 2   # 창이 뜨는 동안 잠깐 보여 주고 닫힘
