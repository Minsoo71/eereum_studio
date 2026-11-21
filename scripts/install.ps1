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
function Must($what, $code = $LASTEXITCODE) { if ($code -ne 0) { throw "$what 실패(코드 $code) · 위 메시지를 PC2에게 알려 주세요." } }
function GetRepo($url, $dir, $branch) {
  if (-not (Test-Path (Join-Path $dir '.git'))) { & git clone --branch $branch $url $dir; Must "받기($url)" }
  else { & git -C $dir fetch origin $branch; Must "최신 받기($dir)"; & git -C $dir merge --ff-only "origin/$branch"; Must "최신으로 맞추기($dir)" }
}

Step 1 'Node 버전 확인(26 이상)'
$nodeVer = (& node -v) -replace '^v', ''
if ([int]($nodeVer.Split('.')[0]) -lt 26) { throw "Node 26 이상이 필요해요(지금 $nodeVer). https://nodejs.org 에서 설치 뒤 다시." }
# pnpm 찾기(PC2-스튜디오-1): ① pnpm 있으면 그대로 ② 없으면 corepack enable ③ 그래도 없으면 npm으로 설치
# (Node 25부터 corepack이 Node에 기본으로 들어 있지 않음 → Node 26에서 "corepack is not recognized"로 멈췄음)
$PnpmVersion = '10.34.9'  # 쇼핑몰 저장소 package.json packageManager와 같은 판
function HasCmd($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function RefreshPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path }
if (HasCmd 'pnpm') { Write-Host "  pnpm 있음: $(& pnpm -v)" }
else {
  if (HasCmd 'corepack') { Write-Host '  pnpm 없음 → corepack enable'; & corepack enable; RefreshPath }
  if (-not (HasCmd 'pnpm')) {
    if (-not (HasCmd 'npm')) { throw 'pnpm도 npm도 없어요. https://nodejs.org 에서 Node 26을 다시 설치한 뒤 설치하기.cmd를 다시 눌러 주세요.' }
    Write-Host "  pnpm 없음 → npm install -g pnpm@$PnpmVersion (1분쯤)"
    & npm install -g "pnpm@$PnpmVersion"; Must "pnpm 설치(npm install -g pnpm@$PnpmVersion)"
    RefreshPath
    # 방금 설치한 pnpm을 PowerShell 5.1이 이 창에서 못 찾을 때가 있음(명령 찾기 기억 · 시험에서 확인)
    # → npm 전역 폴더의 pnpm.cmd를 직접 가리킴 · 이 창 PATH 앞에도 더함(사본 설치 중 다른 도구가 pnpm을 부를 때)
    if (-not (HasCmd 'pnpm')) {
      $npmBin = "$(& npm prefix -g | Select-Object -Last 1)".Trim()
      $full = Join-Path $npmBin 'pnpm.cmd'
      if ($npmBin -and (Test-Path $full)) { $env:Path = "$npmBin;" + $env:Path; Set-Alias -Name pnpm -Value $full -Scope Script }
    }
  }
  if (-not (HasCmd 'pnpm')) { throw 'pnpm을 설치했지만 찾지 못했어요. 이 창을 닫고 설치하기.cmd를 다시 눌러 주세요. 그래도 같으면 이 화면을 PC2에게 보내 주세요.' }
  Write-Host "  pnpm 준비됨: $(& pnpm -v)" -ForegroundColor Green
}

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
  # PC2-스튜디오-1: 따로 뺀 db-firewall.ps1 — 설치를 다시 돌려도 · 꺼진 규칙이 있어도 다시 만듦 · 열 때(start.ps1)도 없으면 다시 물음
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'scripts\db-firewall.ps1')
}

Step 6 '공유 폴더 확인 · 바탕화면 바로 가기'
if (-not (Test-Path $Share)) { Write-Warning "공유 폴더가 없어요: $Share (Synology Drive 동기화 · '항상 이 기기에 보관')" }
$start = Join-Path $app 'scripts\start.ps1'
# PC2-스튜디오-4: WScript.Shell 바로 가기는 이름 · 인자를 "유니코드 아닌 프로그램용 언어"(ANSI 코드 페이지)로 바꿔 저장함
#  → 그 설정이 한국어가 아닌 PC에서 한글이 ??? 로 깨져 "Unable to save shortcut"로 설치가 멈췄음(사용자 PC 11-21)
#  ① 한글 경로(공유 폴더)는 바로 가기 인자에 넣지 않고 설정 파일(UTF-8)에 둠 → start.ps1이 읽음
#  ② 바로 가기는 영문 이름으로 저장한 뒤 한글 이름으로 옮김(파일 이름 바꾸기는 유니코드 그대로)
#  ③ 실패해도 설치는 끝 · 직접 여는 한 줄을 보여 줌
@{ root = $Root; share = $Share } | ConvertTo-Json | Set-Content -Encoding UTF8 -Path (Join-Path $Root 'studio-settings.json')
$openCmd = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$start`""
try {
  $desk = [Environment]::GetFolderPath('Desktop')   # OneDrive 바탕화면이면 그 폴더
  if (-not $desk) { throw '바탕화면 폴더를 찾지 못했어요.' }
  if (-not (Test-Path -LiteralPath $desk)) { New-Item -ItemType Directory -Force -Path $desk | Out-Null }
  $tmp = Join-Path $Root 'eereum-studio-open.lnk'
  $sh = (New-Object -ComObject WScript.Shell).CreateShortcut($tmp)
  $sh.TargetPath = 'powershell.exe'
  $sh.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$start`""   # 영문 경로만(Root는 영문 경로 규칙)
  # PC2-스튜디오-2 R-1b: 바로 가기는 늘 DB 없이(데이터 화면은 장바구니 그림 1칸만 필요 → 대장 "데이터 화면 켜기" 단추로 따로) · 옛 바로 가기는 덮어씀
  $sh.WorkingDirectory = $app
  $sh.Save()
  Move-Item -LiteralPath $tmp -Destination (Join-Path $desk '이미지 스튜디오 열기.lnk') -Force
  Write-Host "설치 끝 · 바탕화면 '이미지 스튜디오 열기'를 누르세요." -ForegroundColor Green
} catch {
  Write-Warning "바탕화면 바로 가기를 만들지 못했어요: $($_.Exception.Message)"
  Write-Host '설치는 끝났어요. 이미지 스튜디오는 PowerShell 창에 아래 한 줄을 붙여 넣고 Enter로 열 수 있어요:' -ForegroundColor Yellow
  Write-Host "  $openCmd" -ForegroundColor Yellow
}
