# Church Studio speech helper for Windows: the offline speech recognizer built into Windows
# (System.Speech), printing one JSON line per phrase in the same shape as the macOS helper:
#   {"kind":"phrase","text":"...","final":false,"alternatives":[...]}  plus "level", "status", "error".
# The app reads these lines and finds verses; this script only listens.

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Emit([hashtable]$payload) {
  [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress -Depth 3))
  [Console]::Out.Flush()
}

try {
  Add-Type -AssemblyName System.Speech
} catch {
  Emit @{ kind = "error"; message = "Windows speech recognition is not available on this PC." }
  exit 1
}

$recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
$info = $recognizers | Where-Object { $_.Culture.Name -eq "en-US" } | Select-Object -First 1
if (-not $info) { $info = $recognizers | Where-Object { $_.Culture.Name -like "en-*" } | Select-Object -First 1 }
if (-not $info) {
  Emit @{ kind = "error"; message = "No English speech recognizer is installed. Add English speech in Windows Settings > Time & language > Speech." }
  exit 1
}

$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
try {
  $engine.SetInputToDefaultAudioDevice()
} catch {
  Emit @{ kind = "error"; message = "No microphone is available, or Windows blocked it. Check Settings > Privacy & security > Microphone." }
  exit 1
}
$engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$engine.MaxAlternates = 5

$null = Register-ObjectEvent -InputObject $engine -EventName SpeechHypothesized -SourceIdentifier "hyp"
$null = Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -SourceIdentifier "rec"
$null = Register-ObjectEvent -InputObject $engine -EventName AudioLevelUpdated -SourceIdentifier "lvl"
$engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
Emit @{ kind = "status"; message = "Listening. Speak a reference or read a verse." }

$lastLevel = [DateTime]::MinValue
while ($true) {
  $event = Wait-Event -Timeout 1
  if (-not $event) { continue }
  try {
    switch ($event.SourceIdentifier) {
      "hyp" {
        Emit @{ kind = "phrase"; text = $event.SourceEventArgs.Result.Text; final = $false; alternatives = [string[]]@() }
      }
      "rec" {
        $result = $event.SourceEventArgs.Result
        $alternatives = [string[]]@($result.Alternates | Select-Object -First 5 | ForEach-Object { $_.Text })
        Emit @{ kind = "phrase"; text = $result.Text; final = $true; alternatives = $alternatives }
      }
      "lvl" {
        if (((Get-Date) - $lastLevel).TotalMilliseconds -gt 80) {
          $lastLevel = Get-Date
          Emit @{ kind = "level"; value = [Math]::Min(1, $event.SourceEventArgs.AudioLevel / 60) }
        }
      }
    }
  } finally {
    Remove-Event -EventIdentifier $event.EventIdentifier
  }
}
