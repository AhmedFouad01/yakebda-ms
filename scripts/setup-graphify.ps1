[CmdletBinding()]
param(
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$GraphifyVersion = '0.9.17',

    [switch]$SkipGraphBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$AllowFailure
    )

    & $FilePath @Arguments 2>&1 | ForEach-Object { Write-Host $_ }
    $exitCode = [int]$LASTEXITCODE

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "Command failed with exit code $exitCode: $FilePath $($Arguments -join ' ')"
    }

    return $exitCode
}

function Resolve-CommandPath {
    param([Parameter(Mandatory)][string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        return $null
    }

    if (-not [string]::IsNullOrWhiteSpace($command.Source)) {
        return $command.Source
    }

    return $command.Name
}

function Enable-CodexMultiAgent {
    $codexDirectory = Join-Path $HOME '.codex'
    $configPath = Join-Path $codexDirectory 'config.toml'
    New-Item -ItemType Directory -Path $codexDirectory -Force | Out-Null

    $content = if (Test-Path $configPath) {
        [System.IO.File]::ReadAllText($configPath)
    } else {
        ''
    }

    $featuresPattern = '(?ms)^\[features\][^\r\n]*\r?\n.*?(?=^\[|\z)'
    $featuresMatch = [regex]::Match($content, $featuresPattern)

    if ($featuresMatch.Success) {
        $section = $featuresMatch.Value
        if ($section -match '(?m)^\s*multi_agent\s*=') {
            $updatedSection = [regex]::Replace(
                $section,
                '(?m)^\s*multi_agent\s*=.*$',
                'multi_agent = true'
            )
        } else {
            $updatedSection = $section.TrimEnd() + "`r`nmulti_agent = true`r`n"
        }

        $updatedContent = $content.Substring(0, $featuresMatch.Index) +
            $updatedSection +
            $content.Substring($featuresMatch.Index + $featuresMatch.Length)
    } else {
        $separator = if ([string]::IsNullOrWhiteSpace($content)) {
            ''
        } elseif ($content.EndsWith("`n")) {
            "`r`n"
        } else {
            "`r`n`r`n"
        }

        $updatedContent = $content + $separator + "[features]`r`nmulti_agent = true`r`n"
    }

    if ($updatedContent -ne $content) {
        if (Test-Path $configPath) {
            $backupPath = "$configPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            Copy-Item $configPath $backupPath -Force
            Write-Host "Codex config backup: $backupPath"
        }

        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($configPath, $updatedContent, $utf8NoBom)
        Write-Host "Enabled Codex multi-agent extraction in $configPath"
    } else {
        Write-Host 'Codex multi-agent extraction is already enabled.'
    }
}

function Add-LocalGitExcludes {
    param(
        [Parameter(Mandatory)][string]$RepositoryRoot,
        [Parameter(Mandatory)][string]$GitPath
    )

    $excludePathOutput = & $GitPath -C $RepositoryRoot rev-parse --git-path info/exclude 2>$null
    if ($LASTEXITCODE -ne 0 -or $null -eq $excludePathOutput) {
        throw 'Could not resolve the repository-local Git exclude file.'
    }

    $excludePathRaw = ($excludePathOutput | Out-String).Trim()
    $excludePath = if ([System.IO.Path]::IsPathRooted($excludePathRaw)) {
        $excludePathRaw
    } else {
        Join-Path $RepositoryRoot $excludePathRaw
    }

    $excludeDirectory = Split-Path $excludePath -Parent
    New-Item -ItemType Directory -Path $excludeDirectory -Force | Out-Null

    $existingLines = if (Test-Path $excludePath) {
        Get-Content $excludePath
    } else {
        @()
    }

    $patterns = @(
        '.agents/skills/graphify/',
        '.claude/skills/graphify/',
        '.claude/CLAUDE.md',
        '.claude/settings.json',
        '.codex/hooks.json'
    )

    $missing = @($patterns | Where-Object { $_ -notin $existingLines })
    if ($missing.Count -gt 0) {
        $linesToAdd = @('', '# Graphify machine-local assistant integration') + $missing
        Add-Content -Path $excludePath -Value $linesToAdd
        Write-Host "Added machine-local Graphify files to $excludePath"
    }
}

Write-Step 'Validate YAKEBDA_MS repository'
$gitPath = Resolve-CommandPath -Name 'git'
if (-not $gitPath) {
    throw 'Git is required but was not found on PATH.'
}

$repositoryRootOutput = & $gitPath rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -ne 0 -or $null -eq $repositoryRootOutput) {
    throw 'Run this script from inside the YAKEBDA_MS Git repository.'
}

$repositoryRoot = ($repositoryRootOutput | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($repositoryRoot)) {
    throw 'Git returned an empty repository root.'
}

Set-Location $repositoryRoot
if (-not (Test-Path 'AGENTS.md') -or -not (Test-Path 'package.json')) {
    throw "The repository at '$repositoryRoot' does not look like YAKEBDA_MS."
}

Write-Host "Repository: $repositoryRoot"

Write-Step 'Install uv when required'
$uvPath = Resolve-CommandPath -Name 'uv'
if (-not $uvPath) {
    $wingetPath = Resolve-CommandPath -Name 'winget'
    if (-not $wingetPath) {
        throw 'Neither uv nor winget was found. Install uv from Astral, then rerun this script.'
    }

    [void](Invoke-NativeCommand -FilePath $wingetPath -Arguments @(
        'install',
        '--id', 'astral-sh.uv',
        '--exact',
        '--source', 'winget',
        '--accept-package-agreements',
        '--accept-source-agreements'
    ))

    $candidateDirectories = @(
        (Join-Path $HOME '.local\bin'),
        (Join-Path $HOME '.cargo\bin')
    )

    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $candidateDirectories += @(
            (Join-Path $env:LOCALAPPDATA 'Programs\uv'),
            (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links')
        )
    }

    foreach ($directory in $candidateDirectories) {
        if (Test-Path $directory) {
            $env:Path = "$directory;$env:Path"
        }
    }

    $uvPath = Resolve-CommandPath -Name 'uv'
    if (-not $uvPath) {
        throw 'uv was installed but is not available in this terminal. Open a new terminal and rerun the script.'
    }
}

Write-Step "Install pinned Graphify $GraphifyVersion"
[void](Invoke-NativeCommand -FilePath $uvPath -Arguments @(
    'tool', 'install', '--force', "graphifyy==$GraphifyVersion"
))

$uvBinDirectoryOutput = & $uvPath tool dir --bin 2>$null
if ($LASTEXITCODE -eq 0 -and $null -ne $uvBinDirectoryOutput) {
    $uvBinDirectory = ($uvBinDirectoryOutput | Out-String).Trim()
    if (-not [string]::IsNullOrWhiteSpace($uvBinDirectory) -and (Test-Path $uvBinDirectory)) {
        $env:Path = "$uvBinDirectory;$env:Path"
    }
}

$graphifyPath = Resolve-CommandPath -Name 'graphify'
if (-not $graphifyPath) {
    throw 'Graphify was installed, but the graphify command is not available on PATH.'
}

[void](Invoke-NativeCommand -FilePath $graphifyPath -Arguments @('--version'))

Write-Step 'Enable Codex parallel extraction'
Enable-CodexMultiAgent

Write-Step 'Install project-scoped Graphify skill for Codex'
[void](Invoke-NativeCommand -FilePath $graphifyPath -Arguments @(
    'install', '--project', '--platform', 'codex'
))

Write-Step 'Install project-scoped Graphify skill for Claude Code'
$claudePlatform = if ($env:OS -eq 'Windows_NT') { 'windows' } else { 'claude' }
[void](Invoke-NativeCommand -FilePath $graphifyPath -Arguments @(
    'install', '--project', '--platform', $claudePlatform
))

Add-LocalGitExcludes -RepositoryRoot $repositoryRoot -GitPath $gitPath
$env:GRAPHIFY_QUERY_LOG_DISABLE = '1'

if (-not $SkipGraphBuild) {
    Write-Step 'Build the initial YAKEBDA_MS knowledge graph'
    $buildExitCode = Invoke-NativeCommand -FilePath $graphifyPath -Arguments @('.') -AllowFailure

    if ($buildExitCode -eq 0 -and (Test-Path 'graphify-out\graph.json')) {
        Write-Step 'Install local post-commit graph refresh hook'
        [void](Invoke-NativeCommand -FilePath $graphifyPath -Arguments @('hook', 'install'))
    } else {
        Write-Warning 'The assistant skills were installed, but the initial graph build did not finish. Run $graphify . in Codex or /graphify . in Claude Code from the repository root.'
    }
}

Write-Step 'Verification'
Write-Host "Graphify executable: $graphifyPath"
Write-Host "Codex instructions:  $(Test-Path 'AGENTS.md')"
Write-Host "Claude instructions: $(Test-Path 'CLAUDE.md')"
Write-Host "Graph generated:      $(Test-Path 'graphify-out\graph.json')"
Write-Host ''
Write-Host 'Codex command:  $graphify .'
Write-Host 'Claude command: /graphify .'
Write-Host 'PowerShell:     graphify query "How is YAKEBDA_MS structured?"'
