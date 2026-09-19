# sync.ps1 -- publish the skills in this repo to each tool's own location.
#
# One canonical body per skill lives in skills/<name>/SKILL.md. Tools differ in
# where they look and which extra files they understand, not in what the skill
# says. This script is the only thing that writes to those locations.
#
#   .\sync.ps1                  report drift; write nothing
#   .\sync.ps1 -Apply           install, refusing to clobber a drifted target
#   .\sync.ps1 -Apply -Force    install, overwriting drifted targets
#   .\sync.ps1 -Tool codex      restrict to one tool
#   .\sync.ps1 -Apply -ProjectPath C:\path\to\repo    also write project-scoped tools
#
# WHY THIS EXISTS
# A workflow kept as one copy per runner drifts. In the options-scanner project
# a churn-triage gate was added to the Claude copy of /debrief and never to the
# AntiGravity copy -- which was the runner that actually ran it. The gap stood
# for six weeks and is still an open issue there. Editing a destination by hand
# recreates exactly that failure, so the default mode here reports drift rather
# than silently repairing it: drift means someone edited the wrong file, and you
# want to know which way the change should travel before it is overwritten.
#
# ASCII only, deliberately. A UTF-8 em-dash in a scheduled .ps1 once crashed
# PowerShell 5.1 under the CP1252 code page.

[CmdletBinding()]
param(
    [switch] $Apply,
    [switch] $Force,
    [string] $Tool,
    [string] $ProjectPath
)

$ErrorActionPreference = 'Stop'
$repo     = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Import-PowerShellDataFile (Join-Path $repo 'targets.psd1')

function Resolve-Dest {
    param([string] $Template, [string] $SkillName)
    $p = $Template.Replace('<name>', $SkillName)
    $p = $p.Replace('$HOME', $HOME)
    if ($p -match '<project>') {
        if (-not $ProjectPath) { return $null }
        $p = $p.Replace('<project>', $ProjectPath)
    }
    return $p
}

# Compare on content with line endings normalised. Git may check a file out as
# CRLF while the source is LF; that is not drift and must not read as drift.
function Test-SameContent {
    param([string] $A, [string] $B)
    if (-not (Test-Path $A) -or -not (Test-Path $B)) { return $false }
    $na = (Get-Content -LiteralPath $A -Raw) -replace "`r`n", "`n"
    $nb = (Get-Content -LiteralPath $B -Raw) -replace "`r`n", "`n"
    return $na -eq $nb
}

$results = @()

foreach ($skillName in ($manifest.Skills.Keys | Sort-Object)) {
    $skillDir = Join-Path $repo "skills\$skillName"
    if (-not (Test-Path $skillDir)) {
        Write-Warning "skills\$skillName is in the manifest but not on disk"
        continue
    }

    foreach ($toolName in $manifest.Skills[$skillName]) {
        if ($Tool -and $Tool -ne $toolName) { continue }

        $spec = $manifest.Tools[$toolName]
        if (-not $spec) { Write-Warning "unknown tool '$toolName'"; continue }

        $dest = Resolve-Dest -Template $spec.Dest -SkillName $skillName
        if (-not $dest) {
            $results += [pscustomobject]@{
                Skill = $skillName; Tool = $toolName; State = 'skipped'
                Detail = 'project-scoped; pass -ProjectPath' }
            continue
        }

        # Build the source -> destination file pairs for this tool.
        $pairs = @()
        if ($spec.Flatten) {
            $pairs += [pscustomobject]@{
                From = Join-Path $skillDir $spec.Flatten
                To   = Join-Path $dest ($spec.Rename.Replace('<name>', $skillName))
            }
        } else {
            foreach ($entry in $spec.Include) {
                $src = Join-Path $skillDir $entry
                if (-not (Test-Path $src)) { continue }
                if (Test-Path $src -PathType Container) {
                    Get-ChildItem $src -Recurse -File | ForEach-Object {
                        $rel = $_.FullName.Substring($skillDir.Length).TrimStart('\')
                        $pairs += [pscustomobject]@{ From = $_.FullName; To = Join-Path $dest $rel }
                    }
                } else {
                    $pairs += [pscustomobject]@{ From = $src; To = Join-Path $dest $entry }
                }
            }
        }

        $missing = @(); $drifted = @()
        foreach ($p in $pairs) {
            if (-not (Test-Path $p.To))                       { $missing += $p }
            elseif (-not (Test-SameContent $p.From $p.To))    { $drifted += $p }
        }

        if ($missing.Count -eq 0 -and $drifted.Count -eq 0) {
            $results += [pscustomobject]@{
                Skill = $skillName; Tool = $toolName; State = 'in sync'; Detail = "$($pairs.Count) files" }
            continue
        }

        if (-not $Apply) {
            $detail = @()
            if ($missing.Count) { $detail += "$($missing.Count) missing" }
            if ($drifted.Count) { $detail += "$($drifted.Count) DRIFTED" }
            $results += [pscustomobject]@{
                Skill = $skillName; Tool = $toolName; State = 'needs sync'; Detail = ($detail -join ', ') }
            foreach ($d in $drifted) { Write-Host "    drifted: $($d.To)" -ForegroundColor Yellow }
            continue
        }

        if ($drifted.Count -and -not $Force) {
            $results += [pscustomobject]@{
                Skill = $skillName; Tool = $toolName; State = 'REFUSED'
                Detail = "$($drifted.Count) drifted; re-run with -Force to overwrite" }
            foreach ($d in $drifted) { Write-Host "    drifted: $($d.To)" -ForegroundColor Red }
            continue
        }

        foreach ($p in ($missing + $drifted)) {
            $parent = Split-Path $p.To -Parent
            if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
            Copy-Item -LiteralPath $p.From -Destination $p.To -Force
        }
        $results += [pscustomobject]@{
            Skill = $skillName; Tool = $toolName; State = 'written'
            Detail = "$($missing.Count + $drifted.Count) files" }
    }
}

$results | Sort-Object Skill, Tool | Format-Table -AutoSize

if (-not $Apply) {
    $pending = @($results | Where-Object { $_.State -ne 'in sync' -and $_.State -ne 'skipped' })
    if ($pending.Count) {
        Write-Host "`nReport only. Re-run with -Apply to write." -ForegroundColor Cyan
    } else {
        Write-Host "`nEverything in sync." -ForegroundColor Green
    }
}

# A refusal is a real failure, so CI and callers see a non-zero exit.
#
# Both branches exit explicitly. A script that falls off the end sets no exit
# code at all, leaving $LASTEXITCODE at whatever the previous command set -- so
# a clean run following a refusal still read as a failure, and a refusal
# following a clean run could have read as success.
if (@($results | Where-Object { $_.State -eq 'REFUSED' }).Count) { exit 1 }
exit 0
