# eereum 이미지 스튜디오 설치 (M4 · Windows PowerShell 5.1 · 관리자 권한 필요 없음 · -WithDb일 때만 방화벽 규칙에 관리자 허락 한 번)
# 쓰는 법:  powershell -ExecutionPolicy Bypass -File scripts\install.ps1
# 하는 일: ① Node 26 확인 ② 백신 인증서 설정 ③ 쇼핑몰 사본(D:\eereum_studio\site · 영문 경로 · 쇼핑몰 저장소 main · 읽기만) 준비 · 설치
#          ④ 스튜디오(이 저장소 · D:\eereum_studio\app) 설치 ⑤ 내장 DB prisma dev 0.16.28 미리 받기(선택) ⑥ 바탕화면 "이미지 스튜디오 열기"
# 하지 않는 일: .env 만들기 · 비밀값 · 운영 DB 접속 · 저장소에 쓰기(push)
param(
  [string]$Root = 'D:\eereum_studio',
  [string]$ShopRepo = 'https://github.com/Minsoo71/eereum_ring.git',     # 읽기만(처음 한 번 GitHub 로그인으로 허락)
  [string]$StudioRepo = 'https://github.com/Minsoo71/eereum_studio.git', # 읽기만
  [string]$StudioBranch = 'integration',
  [string]$StudioCommit = '',  # 정해진 판(예: G1 판)으로 고정할 때 커밋 번호
  [string]$Share = 'D:\Synology Drive VISCOM\eeruem\이미지교체',
  [switch]$WithDb
)
$ErrorActionPreference = 'Stop'
function Step($n, $msg) { Write-Host "[$n] $msg" -ForegroundColor Cyan }
function Must($what, $code = $LASTEXITCODE) { if ($code -ne 0) { throw "$what 실패(코드 $code) · 위 메시지를 PC9에게 알려 주세요." } }
function GetRepo($url, $dir, $branch) {
  if (-not (Test-Path (Join-Path $dir '.git'))) { & git clone --branch $branch $url $dir; Must "받기($url)" }
  else { & git -C $dir fetch origin $branch; Must "최신 받기($dir)"; & git -C $dir merge --ff-only "origin/$branch"; Must "최신으로 맞추기($dir)" }
}

Step 1 'Node 버전 확인(26 이상)'
$nodeVer = (& node -v) -replace '^v', ''
if ([int]($nodeVer.Split('.')[0]) -lt 26) { throw "Node 26 이상이 필요해요(지금 $nodeVer). https://nodejs.org 에서 설치 뒤 다시." }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { & corepack enable; if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { throw 'pnpm이 없어요. corepack enable 또는 npm i -g pnpm@10.34.9' } }

Step 2 '백신 인증서(NODE_OPTIONS=--use-system-ca) 이 사용자에 저장'
[Environment]::SetEnvironmentVariable('NODE_OPTIONS', '--use-system-ca', 'User')
$env:NODE_OPTIONS = '--use-system-ca'

Step 3 "쇼핑몰 사본 준비 · $Root\site (main)"
New-Item -ItemType Directory -Force $Root | Out-Null
$site = Join-Path $Root 'site'
GetRepo $ShopRepo $site 'main'
if (Test-Path (Join-Path $site '.env')) { Write-Warning '사본에 .env가 있어요. 스튜디오 사본에는 .env를 두지 않아요(비밀값 0).' }
Push-Location $site; & pnpm install --frozen-lockfile; $c = $LASTEXITCODE; Pop-Location; Must '쇼핑몰 사본 설치(pnpm install)' $c

Step 4 "스튜디오 설치 · $Root\app ($StudioBranch)"
$app = Join-Path $Root 'app'
GetRepo $StudioRepo $app $StudioBranch
if ($StudioCommit) { & git -C $app checkout -q $StudioCommit; Must "판 $StudioCommit 고르기"; Write-Host "  스튜디오 판 = $StudioCommit" }
Push-Location $app; & pnpm install --frozen-lockfile; $c = $LASTEXITCODE; Pop-Location; Must '스튜디오 설치(pnpm install)' $c

if ($WithDb) {
  Step 5 '내장 DB prisma dev 0.16.28 미리 받기(데이터 화면 보기용 · 인터넷 한 번)'
  Push-Location (Join-Path $site 'packages\db')
  & node node_modules\prisma\build\index.js dev '@0.16.28' --help | Out-Null
  Pop-Location

  # R-1(PC6 11-19): prisma dev가 관리 포트 51213을 모든 주소로 엶(주소 옵션 없음) → 밖에서 들어오기 막는 방화벽 규칙
  # (같은 컴퓨터 안 localhost 연결은 Windows 방화벽이 막지 않음 · 스튜디오는 그대로 씀)
  $rule = 'eereum studio - block DB 51213'
  if (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue) { Write-Host "  방화벽 규칙 이미 있음: $rule" }
  else {
    Write-Host '  방화벽 규칙 만들기 → Windows "변경 허용" 창에서 [예]를 눌러 주세요(관리자 허락 한 번).' -ForegroundColor Yellow
    $cmd = "New-NetFirewallRule -DisplayName '$rule' -Direction Inbound -Protocol TCP -LocalPort 51213-51216 -Action Block -Profile Any | Out-Null"
    try { Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', $cmd } catch { Write-Warning '관리자 허락을 받지 못했어요.' }
    if (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue) { Write-Host "  방화벽 규칙 만듦: $rule" -ForegroundColor Green }
    else { Write-Warning '방화벽 규칙이 없어요 → 데이터 화면(-WithDb)을 켜면 대장에 경고가 떠요. Windows 방화벽 허용 창이 뜨면 "허용 안 함"을 누르세요.' }
  }
}

Step 6 '공유 폴더 확인 · 바탕화면 바로 가기'
if (-not (Test-Path $Share)) { Write-Warning "공유 폴더가 없어요: $Share (Synology Drive 동기화 · '항상 이 기기에 보관')" }
$start = Join-Path $app 'scripts\start.ps1'
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) '이미지 스튜디오 열기.lnk'
$sh = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$sh.TargetPath = 'powershell.exe'
$sh.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$start`" -Root `"$Root`" -Share `"$Share`""
if ($WithDb) { $sh.Arguments += ' -WithDb' }  # 데이터 화면(내장 DB)도 같이 켬
$sh.WorkingDirectory = $app
$sh.Save()
Write-Host "설치 끝 · 바탕화면 '이미지 스튜디오 열기'를 누르세요." -ForegroundColor Green
