param(
  [string]$Repo = "C:\Users\Peter\Coding_Projects\Rentenrechner-automation",
  [string]$CodexExe = "C:\Users\Peter\AppData\Local\OpenAI\Codex\bin\codex.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$automationDir = Join-Path $env:USERPROFILE ".codex\automations\codex-stage-1-investigator"
$logDir = Join-Path $automationDir "logs"
$lockFile = Join-Path $automationDir "local-run.lock"
$lastMessage = Join-Path $automationDir "last-local-message.txt"
$retroScratch = Join-Path $Repo ".automation-retro-entry.md"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $logDir "local-run-$stamp.log"
$stderrFile = Join-Path $logDir "local-run-$stamp.stderr.log"

function Write-Log {
  param([string]$Message)

  $line = "[$((Get-Date).ToString('o'))] $Message"
  Add-Content -LiteralPath $logFile -Value $line
  Write-Output $line
}

if (Test-Path -LiteralPath $lockFile) {
  $lockAge = (Get-Date) - (Get-Item -LiteralPath $lockFile).LastWriteTime
  if ($lockAge.TotalHours -lt 3) {
    Write-Log "Previous Stage 1 run still appears active; skipping this interval."
    exit 0
  }

  Write-Log "Removing stale Stage 1 lock older than 3 hours."
  Remove-Item -LiteralPath $lockFile -Force
}

$lockStream = $null
try {
  $lockStream = [System.IO.File]::Open(
    $lockFile,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
  )
  $lockText = "pid=$PID`nstarted=$((Get-Date).ToString('o'))`n"
  $lockBytes = [System.Text.Encoding]::UTF8.GetBytes($lockText)
  $lockStream.Write($lockBytes, 0, $lockBytes.Length)
  $lockStream.Flush()

  if (-not (Test-Path -LiteralPath $Repo)) {
    throw "Repository path does not exist: $Repo"
  }

  if (-not (Test-Path -LiteralPath $CodexExe)) {
    throw "Codex executable does not exist: $CodexExe"
  }

  if (Test-Path -LiteralPath $retroScratch) {
    Write-Log "Removing stale Stage 1 retro scratch file before run: $retroScratch"
    Remove-Item -LiteralPath $retroScratch -Force
  }

  $prompt = @'
Run the versioned Stage 1 issue investigation prompt for this repository.

Preflight:
1. Verify the working tree is clean with `git status --short`; if it is not clean, stop before touching GitHub labels.
2. Refresh `origin/main` without writing `.git/FETCH_HEAD`:
   `git fetch --no-write-fetch-head origin +refs/heads/main:refs/remotes/origin/main`
3. Check out and fast-forward local main, using separate commands so Windows PowerShell can run them:
   `git checkout main`
   `git merge --ff-only origin/main`
4. If any preflight command fails, stop before touching GitHub labels/comments and record the blocker in automation memory. Do not retry with plain `git fetch origin main`.

Then read `docs/automation/codex-stage1-investigator.md` and execute that prompt exactly, processing up to two eligible `ready-for-agent` issues.

This automation owns Stage 1 investigation. It must not implement fixes; successful issue runs hand off by posting the Stage 1 handoff comment and applying `ready-for-PR`.
When applying `ready-for-PR`, run the explicit `gh issue edit <N> --add-label ready-for-PR` command from the versioned prompt and verify the label with `gh issue view`; do not only state that the label is in place.
'@

  $codexArgs = @(
    "exec",
    "-C", $Repo,
    "-m", "gpt-5.5",
    "-c", 'model_reasoning_effort="medium"',
    "--dangerously-bypass-approvals-and-sandbox",
    "--output-last-message", $lastMessage,
    "-"
  )

  Write-Log "Starting local Codex Stage 1 run in $Repo."
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $prompt | & $CodexExe @codexArgs 2> $stderrFile | Tee-Object -FilePath $logFile -Append
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) {
    if (Test-Path -LiteralPath $stderrFile) {
      Add-Content -LiteralPath $logFile -Value "Codex stderr:"
      Get-Content -LiteralPath $stderrFile | Add-Content -LiteralPath $logFile
    }

    throw "codex exec failed with exit code $exitCode"
  }

  Remove-Item -LiteralPath $stderrFile -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $retroScratch) {
    Write-Log "Removing post-run Stage 1 retro scratch file: $retroScratch"
    Remove-Item -LiteralPath $retroScratch -Force
  }

  Write-Log "Completed local Codex Stage 1 run."
}
finally {
  if ($null -ne $lockStream) {
    $lockStream.Dispose()
  }

  Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
}
