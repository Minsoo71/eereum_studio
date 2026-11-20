# 내장 DB 관리 포트(51213~51216) 밖에서 들어오기 막는 방화벽 규칙 만들기 (R-1 · PC2-스튜디오-1 · R-1b PC2-스튜디오-2)
# install.ps1(-WithDb) · start.ps1(-WithDb) · 도우미 "데이터 화면 켜기"가 부름
# - 규칙 확인은 관리자 없이(COM HNetCfg.FwPolicy2) — Get-NetFirewallRule은 보통 창에서 규칙을 0개로 보여 "없음"으로 잘못 봤음(R-1b · PC6)
# - 관리자 허락 창은 처음 한 번만: 만든 뒤 표시 파일(<스튜디오 폴더>\_db-firewall.done) · 표시가 있으면 다시 묻지 않음(경고만)
#   다시 만들어야 할 때만: db-firewall.ps1 -Force
# 끝 코드: 0 = 규칙 있음 · 2 = 규칙 없음(허락 안 함 · 만들기 실패 · 이미 한 번 물어봄)
param([switch]$Quiet, [switch]$Force)
$ErrorActionPreference = 'Stop'
$rule = 'eereum studio - block DB 51213'   # server/safety.mjs DB_FIREWALL_RULE와 같은 이름
$done = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) '_db-firewall.done'   # D:\eereum_studio\_db-firewall.done
function HasRule {
  # COM 규칙 Name = 표시 이름 · Action 0 = 막기 · Direction 1 = 들어오기
  try { [bool](@((New-Object -ComObject HNetCfg.FwPolicy2).Rules) | Where-Object { $_.Name -eq $rule -and $_.Enabled -and $_.Action -eq 0 -and $_.Direction -eq 1 }) }
  catch { $false }
}
if (HasRule) {
  if (-not (Test-Path $done)) { Set-Content -Path $done -Value (Get-Date -Format s) -Encoding ASCII -ErrorAction SilentlyContinue }
  if (-not $Quiet) { Write-Host "  방화벽 규칙 있음: $rule" }
  exit 0
}
if ((Test-Path $done) -and -not $Force) {
  Write-Warning '방화벽 규칙이 안 보여요. 관리자 허락 창은 처음 한 번만 띄워서 다시 묻지 않아요 → 대장에 경고가 떠요. 다시 만들려면 PC2에게 알려 주세요(db-firewall.ps1 -Force).'
  exit 2
}

Write-Host '  방화벽 규칙 만들기 → Windows "변경 허용" 창에서 [예]를 눌러 주세요(관리자 허락 한 번).' -ForegroundColor Yellow
# 꺼져 있거나(Enabled False) 허용으로 바뀐 같은 이름 규칙이 있으면 지우고 새로 만듦 · 따옴표 문제가 없게 -EncodedCommand로 넘김
$cmd = "Get-NetFirewallRule -DisplayName '$rule' -ErrorAction SilentlyContinue | Remove-NetFirewallRule; " +
       "New-NetFirewallRule -DisplayName '$rule' -Direction Inbound -Protocol TCP -LocalPort 51213-51216 -Action Block -Profile Any -Enabled True | Out-Null"
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
try { Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile -EncodedCommand $enc" }
catch { Write-Warning '관리자 허락을 받지 못했어요("아니요"를 눌렀거나 창이 닫힘).' }
# 허락했든 안 했든 한 번 물었다는 표시(다음부터 열 때마다 창이 뜨지 않게)
Set-Content -Path $done -Value (Get-Date -Format s) -Encoding ASCII -ErrorAction SilentlyContinue

if (HasRule) { Write-Host "  방화벽 규칙 만듦: $rule" -ForegroundColor Green; exit 0 }
Write-Warning '방화벽 규칙이 없어요 → 데이터 화면(DB)을 켜면 대장에 경고가 떠요. Windows 방화벽 허용 창이 뜨면 "허용 안 함"을 누르세요. 다시 만들려면 PC2에게 알려 주세요.'
exit 2
