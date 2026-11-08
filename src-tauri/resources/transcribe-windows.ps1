# Church Studio speech helper for Windows: the offline speech recognizer built into Windows
# (System.Speech), printing one JSON line per phrase in the same shape as the macOS helper:
#   {"kind":"phrase","text":"...","final":false,"alternatives":[...]}  plus "level", "status", "error".
# The app reads these lines and finds verses; this script only listens.
# -Stdin: the app has cleaned the microphone (Noise filter) and sends 16 kHz mono 16-bit PCM on
# standard input; the app reports levels itself. Closing the input ends the script.

param([switch]$Stdin)

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

$recognizers = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
$info = $recognizers | Where-Object { $_.Culture.Name -eq "en-US" } | Select-Object -First 1
if (-not $info) { $info = $recognizers | Where-Object { $_.Culture.Name -like "en-*" } | Select-Object -First 1 }
if (-not $info) {
  # Say what Windows has, so a support file shows whether speech was never installed or is in
  # another language only.
  $found = ($recognizers | ForEach-Object { $_.Culture.Name }) -join ", "
  if (-not $found) { $found = "none" }
  Emit @{ kind = "error"; message = "Windows has no English speech recognizer on this PC (installed: $found). In Windows Settings > Time & language > Language & region, add English (United States), open its Language options and install Speech recognition. Or choose Accurate under Settings > Sound & voice." }
  exit 1
}

if ($Stdin) {
  # System.Speech asks the input stream for its position and length, and a pipe has neither ("Stream
  # does not support seeking"). This wrapper reads the pipe forward and answers those questions with
  # how far it has read, which is all the recognizer needs from a live stream.
  Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.IO;
public sealed class ChurchStudioLiveStream : Stream {
  private readonly Stream inner;
  private long read;
  public ChurchStudioLiveStream(Stream inner) { this.inner = inner; }
  public override bool CanRead { get { return true; } }
  public override bool CanSeek { get { return true; } }
  public override bool CanWrite { get { return false; } }
  public override long Length { get { return long.MaxValue; } }
  public override long Position { get { return read; } set { } }
  public override int Read(byte[] buffer, int offset, int count) {
    int n = inner.Read(buffer, offset, count);
    read += n;
    return n;
  }
  public override long Seek(long offset, SeekOrigin origin) { return read; }
  public override void Flush() { }
  public override void SetLength(long value) { throw new NotSupportedException(); }
  public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
  protected override void Dispose(bool disposing) { if (disposing) inner.Dispose(); base.Dispose(disposing); }
}
"@
}

$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info)
# The app has already read the privacy switches, so a failure here is usually the device itself, and
# it can be brief (just released by the microphone check, or Windows changing devices): try again
# before giving up, and say what Windows said, for the operator and for a support file.
$opened = $false
$live = $null
$why = ""
for ($attempt = 1; $attempt -le 4 -and -not $opened; $attempt++) {
  try {
    if ($Stdin) {
      $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
      if (-not $live) { $live = New-Object ChurchStudioLiveStream([Console]::OpenStandardInput()) }
      $engine.SetInputToAudioStream($live, $format)
    } else {
      $engine.SetInputToDefaultAudioDevice()
    }
    $opened = $true
  } catch {
    $why = $_.Exception.Message
    if ($attempt -lt 4) { Start-Sleep -Milliseconds 500 }
  }
}
if (-not $opened) {
  Emit @{ kind = "error"; message = "Windows could not open the microphone: $why Check it is plugged in and not muted, or choose another under Settings > Sound & voice." }
  exit 1
}
$engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$engine.MaxAlternates = 5

$null = Register-ObjectEvent -InputObject $engine -EventName SpeechHypothesized -SourceIdentifier "hyp"
$null = Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -SourceIdentifier "rec"
$null = Register-ObjectEvent -InputObject $engine -EventName AudioLevelUpdated -SourceIdentifier "lvl"
# A cleaned stream ends when the app stops listening.
$null = Register-ObjectEvent -InputObject $engine -EventName RecognizeCompleted -SourceIdentifier "done"
$engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
Emit @{ kind = "status"; message = "Listening. Speak a reference or read a verse."; recognizer = "$($info.Name) ($($info.Culture.Name))"; input = $(if ($Stdin) { "app" } else { "microphone" }) }

$lastLevel = [DateTime]::MinValue
# Church Studio's process: if it is gone (a crash, or quit without stopping), this ends too, so the
# microphone is never left open behind it.
$parent = 0
[int]::TryParse("$env:CHURCH_STUDIO_PARENT", [ref]$parent) | Out-Null
while ($true) {
  $event = Wait-Event -Timeout 1
  if ($parent -gt 0 -and -not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit 0 }
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
      "done" {
        # With the app's cleaned audio, the stream ending is how listening stops. Hearing the
        # microphone itself, it means Windows lost it (unplugged, or taken by another app).
        if ($Stdin) { exit 0 }
        Emit @{ kind = "error"; message = "Windows stopped hearing the microphone (unplugged, or taken by another app)." }
        exit 1
      }
      "lvl" {
        if ($Stdin) { break }
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
