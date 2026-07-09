param(
  [string]$Repo = "AhmedFouad01/yakebda-ms",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

Write-Host "Preparing GitHub push for $Repo" -ForegroundColor Cyan

if (-not (Test-Path ".git")) {
  git init
  git branch -M $Branch
}

git add .
git commit -m "Initial YAKEBDA MS repository" 2>$null

$remoteExists = git remote | Select-String -Pattern "^origin$" -Quiet
if (-not $remoteExists) {
  git remote add origin "git@github.com:$Repo.git"
}

git push -u origin $Branch
