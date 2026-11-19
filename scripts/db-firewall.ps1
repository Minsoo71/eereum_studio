# 내장 DB 관리 포트(51213~51216) 밖에서 들어오기 막는 방화벽 규칙 만들기 (R-1 · PC2-스튜디오-1)
# install.ps1(-WithDb)과 start.ps1(-WithDb · 규칙이 없을 때)이 부름 → 설치를 다시 돌려도 · 열 때도 규칙이 생김
# 규칙이 이미 있으면 아무것도 안 함. 없으면 Windows "변경 허용" 창 1번(관리자 허락).
# 끝 코드: 0 = 규칙 있음 · 2 = 규칙 없음(허락 안 함 · 만들기 실패)
param([switch]$Quiet)
$ErrorActionPreference = 'Stop'
$rule = 'eereum studio - block DB 51213'   # server/safety.mjs DB_FIREWALL_RULE와 같은 이름
function HasRule {
  [bool](Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Block' })
}
if (HasRule) { if (-not $Quiet) { Write-Host "  방화벽 규칙 있음: $rule" }; exit 0 }

Write-Host '  방화벽 규칙 만들기 → Windows "변경 허용" 창에서 [예]를 눌러 주세요(관리자 허락 한 번).' -ForegroundColor Yellow
# 꺼져 있거나(Enabled False) 허용으로 바뀐 같은 이름 규칙이 있으면 지우고 새로 만듦 · 따옴표 문제가 없게 -EncodedCommand로 넘김
$cmd = "Get-NetFirewallRule -DisplayName '$rule' -ErrorAction SilentlyContinue | Remove-NetFirewallRule; " +
       "New-NetFirewallRule -DisplayName '$rule' -Direction Inbound -Protocol TCP -LocalPort 51213-51216 -Action Block -Profile Any -Enabled True | Out-Null"
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
try { Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile -EncodedCommand $enc" }
catch { Write-Warning '관리자 허락을 받지 못했어요("아니요"를 눌렀거나 창이 닫힘).' }

if (HasRule) { Write-Host "  방화벽 규칙 만듦: $rule" -ForegroundColor Green; exit 0 }
Write-Warning '방화벽 규칙이 없어요 → 데이터 화면(DB)을 켜면 대장에 경고가 떠요. 다음에 "이미지 스튜디오 열기"를 누를 때 다시 물어요. Windows 방화벽 허용 창이 뜨면 "허용 안 함"을 누르세요.'
exit 2
