# Church Studio listening check for Windows. It tests, one layer at a time, the same path the app's
# "System" listening uses (src-tauri/resources/transcribe-windows.ps1), and prints what each layer saw.
#
# Run it on the Windows PC (no admin needed). In PowerShell:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\listening-check-windows.ps1
# Speak for the 20 seconds it listens ("John chapter three verse sixteen"). At the end it sends what
# it printed to Church Studio support and shows a code: read that code out to us. Nothing else is
# sent (not the computer's or user's name). -NoSend keeps it on this PC only.

param([switch]$NoSend)

$ErrorActionPreference = "Continue"
function Section($title) { Write-Host ""; Write-Host "=== $title ===" -ForegroundColor Cyan }
$transcript = Join-Path $env:TEMP "church-studio-listening-check.txt"
try { Start-Transcript -Path $transcript -Force | Out-Null } catch {}

function Run-Check {

Section "1. Windows"
$script:os = Get-CimInstance Win32_OperatingSystem
$script:build = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion")
Write-Host "$($os.Caption) $($build.DisplayVersion) build $($build.CurrentBuild).$($build.UBR), $([Environment]::Is64BitProcess -replace 'True','64-bit' -replace 'False','32-bit') PowerShell $($PSVersionTable.PSVersion)"
Write-Host "Display language: $((Get-Culture).Name) / UI $((Get-UICulture).Name)"

Section "2. Microphone privacy switches (Deny = blocked)"
$consent = "SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone"
$policy = (Get-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy" -ErrorAction SilentlyContinue).LetAppsAccessMicrophone
Write-Host "Organization policy (2 = always deny): $(if ($null -eq $policy) { 'none' } else { $policy })"
Write-Host "Microphone access (whole PC):          $((Get-ItemProperty "HKLM:\$consent" -ErrorAction SilentlyContinue).Value)"
Write-Host "Let apps access your microphone:       $((Get-ItemProperty "HKCU:\$consent" -ErrorAction SilentlyContinue).Value)"
Write-Host "Let desktop apps access microphone:    $((Get-ItemProperty "HKCU:\$consent\NonPackaged" -ErrorAction SilentlyContinue).Value)"
# Which desktop apps Windows has seen use the microphone, and when (Church Studio and PowerShell should be here).
Get-ChildItem "HKCU:\$consent\NonPackaged" -ErrorAction SilentlyContinue | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath
  $name = $_.PSChildName -replace '#', '\'
  if ($name -match 'church|powershell') { Write-Host "  seen: $name  Value=$($p.Value) LastUsedStop=$($p.LastUsedTimeStop)" }
}

Section "3. Recording devices"
Get-PnpDevice -Class AudioEndpoint -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'mic|input|line|array|headset|webcam|usb' } |
  ForEach-Object { Write-Host "  [$($_.Status)] $($_.FriendlyName)" }
$capture = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Capture"
Get-ChildItem $capture -ErrorAction SilentlyContinue | ForEach-Object {
  $state = (Get-ItemProperty $_.PSPath).DeviceState
  $name = (Get-ItemProperty "$($_.PSPath)\Properties" -ErrorAction SilentlyContinue).'{a45c254e-df1c-4efd-8020-67d146a850e0},2'
  if ($state -eq 1) { Write-Host "  active capture endpoint: $name" }
}

Section "4. Speech recognizers System.Speech can use"
try {
  Add-Type -AssemblyName System.Speech
  $recognizers = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
  if (-not $recognizers.Count) { Write-Host "  NONE: Windows has no desktop speech recognizer (System listening cannot work here)." -ForegroundColor Red }
  $recognizers | ForEach-Object { Write-Host "  $($_.Name) [$($_.Culture.Name)] id=$($_.Id)" }
} catch {
  Write-Host "  System.Speech failed to load: $($_.Exception.Message)" -ForegroundColor Red
  return
}
$info = $recognizers | Where-Object { $_.Culture.Name -eq "en-US" } | Select-Object -First 1
if (-not $info) { $info = $recognizers | Where-Object { $_.Culture.Name -like "en-*" } | Select-Object -First 1 }
if (-not $info) { Write-Host "  No English recognizer: the app stops here with an error." -ForegroundColor Red; return }
Write-Host "  The app would use: $($info.Name) [$($info.Culture.Name)]"

Section "5. Listening for 20 seconds, as the app does: speak now"
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
try { $engine.SetInputToDefaultAudioDevice() } catch { Write-Host "  SetInputToDefaultAudioDevice failed: $($_.Exception.Message)" -ForegroundColor Red; return }
Write-Host "  Audio format the recognizer gets: $($engine.AudioFormat.SamplesPerSecond) Hz, $($engine.AudioFormat.BitsPerSample)-bit, $($engine.AudioFormat.ChannelCount) channel(s)"
$engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$null = Register-ObjectEvent -InputObject $engine -EventName SpeechHypothesized -SourceIdentifier "hyp"
$null = Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -SourceIdentifier "rec"
$null = Register-ObjectEvent -InputObject $engine -EventName SpeechDetected -SourceIdentifier "det"
$null = Register-ObjectEvent -InputObject $engine -EventName SpeechRecognitionRejected -SourceIdentifier "rej"
$null = Register-ObjectEvent -InputObject $engine -EventName AudioLevelUpdated -SourceIdentifier "lvl"
$null = Register-ObjectEvent -InputObject $engine -EventName AudioStateChanged -SourceIdentifier "state"
$null = Register-ObjectEvent -InputObject $engine -EventName RecognizeCompleted -SourceIdentifier "done"
$engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
$until = (Get-Date).AddSeconds(20)
$levels = 0; $loudest = 0; $detected = 0; $hyps = 0; $finals = 0; $rejected = 0
while ((Get-Date) -lt $until) {
  $event = Wait-Event -Timeout 1
  if (-not $event) { continue }
  switch ($event.SourceIdentifier) {
    "lvl" { $levels++; $loudest = [Math]::Max($loudest, $event.SourceEventArgs.AudioLevel) }
    "det" { $detected++ }
    "hyp" { $hyps++ }
    "rec" { $finals++; Write-Host "  heard: $($event.SourceEventArgs.Result.Text)  (confidence $([Math]::Round($event.SourceEventArgs.Result.Confidence, 2)))" -ForegroundColor Green }
    "rej" { $rejected++ }
    "state" { Write-Host "  audio state: $($event.SourceEventArgs.AudioState)" }
    "done" { Write-Host "  recognition ended early: $($event.SourceEventArgs.Error)" -ForegroundColor Red }
  }
  Remove-Event -EventIdentifier $event.EventIdentifier
}
$engine.RecognizeAsyncCancel()
Write-Host ""
Write-Host "  Level updates: $levels   loudest level: $loudest of 100 (talking should reach 10 or more)"
Write-Host "  Speech detected: $detected   guesses: $hyps   phrases heard: $finals   rejected: $rejected"
if ($levels -eq 0) { Write-Host "  RESULT: no sound reached the recognizer at all (privacy switch, wrong default device, or the device is taken)." -ForegroundColor Red }
elseif ($loudest -lt 3) { Write-Host "  RESULT: the recognizer gets silence: the default recording device is muted, the wrong one, or blocked." -ForegroundColor Red }
elseif ($finals -eq 0 -and $hyps -eq 0) { Write-Host "  RESULT: sound arrives but the recognizer understands nothing." -ForegroundColor Yellow }
else { Write-Host "  RESULT: System listening works on this PC." -ForegroundColor Green }

}

Run-Check

Section "6. Church Studio's log (speech helper lines)"
$log = Join-Path $env:LOCALAPPDATA "app.churchstudio.present\logs\church-studio.log"
if (Test-Path $log) { Select-String -Path $log -Pattern "speech helper|microphone|listen|whisper|parakeet" | Select-Object -Last 25 | ForEach-Object { Write-Host "  $($_.Line)" } }
else { Write-Host "  No log at $log" }

try { Stop-Transcript | Out-Null } catch {}
if ($NoSend) { Write-Host ""; Write-Host "Kept on this PC: $transcript"; return }

# Send it: everything after the transcript's own header (which names the computer and the user).
$lines = Get-Content $transcript -ErrorAction SilentlyContinue
$start = [Array]::FindIndex([string[]]$lines, [Predicate[string]]{ param($line) $line -like "=== 1.*" })
$report = if ($start -ge 0) { ($lines[$start..($lines.Count - 1)] | Where-Object { $_ -notmatch '^\*{10,}|^(PowerShell transcript end|End time:)' }) -join "`n" } else { $lines -join "`n" }
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $body = @{ report = $report; kind = "listening-check"; platform = "$($os.Caption) $($build.DisplayVersion) $($build.CurrentBuild)" } | ConvertTo-Json -Compress
  $answer = Invoke-RestMethod -Method Post -Uri "https://license.heitechinc.com/v1/report" -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 30
  Write-Host ""
  Write-Host "Sent to Church Studio support. Your code: $($answer.code)" -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "Could not send it ($($_.Exception.Message)). The results are in $transcript; send that file instead." -ForegroundColor Yellow
}
