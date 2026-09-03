# Locus Windows PowerShell Installer (PRD §3.1 / DIST-4)
# Usage: irm https://raw.githubusercontent.com/code-by-nanthu/locus-ai/main/scripts/install.ps1 | iex
param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$Repo = "code-by-nanthu/locus-ai"
$BinaryName = "locus.exe"
$InstallDir = "$env:LOCALAPPDATA\Programs\Locus"

Write-Host "=== Locus AI Windows Installer ===" -ForegroundColor Cyan

# Handle uninstall
if ($Uninstall) {
    Write-Host "Uninstalling Locus..." -ForegroundColor Yellow
    if (Test-Path "$InstallDir") {
        Remove-Item -Recurse -Force "$InstallDir"
    }
    # Clean PATH
    $UserPath = [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::User)
    if ($UserPath -like "*$InstallDir*") {
        $NewPath = ($UserPath -split ';' | Where-Object { $_ -ne $InstallDir -and $_ -ne "" }) -join ';'
        [Environment]::SetEnvironmentVariable("PATH", $NewPath, [EnvironmentVariableTarget]::User)
        Write-Host "Removed $InstallDir from User PATH." -ForegroundColor DarkGray
    }
    Write-Host "Locus successfully uninstalled." -ForegroundColor Green
    return
}

# Detect architecture
$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
Write-Host "Detected platform: windows ($Arch)" -ForegroundColor Green

# Ensure destination directory exists
if (-not (Test-Path "$InstallDir")) {
    New-Item -ItemType Directory -Path "$InstallDir" -Force | Out-Null
}

$DestPath = Join-Path "$InstallDir" "$BinaryName"
$DownloadUrl = "https://github.com/$Repo/releases/latest/download/locus-windows-$Arch.exe"
$TempFile = Join-Path $env:TEMP "locus-windows-$Arch.exe"

$Installed = $false

# 1. Try downloading precompiled binary from GitHub Releases
try {
    Write-Host "Downloading precompiled executable from $DownloadUrl..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempFile -UseBasicParsing -ErrorAction Stop
    Copy-Item -Path $TempFile -Destination $DestPath -Force
    Remove-Item -Path $TempFile -Force -ErrorAction SilentlyContinue
    $Installed = $true
} catch {
    Write-Host "Precompiled release binary not found online; attempting local build..." -ForegroundColor Yellow
}

# 2. Fallback: Build from repository if bun or node is available
if (-not $Installed) {
    $TempBuildDir = Join-Path $env:TEMP "locus-build-$([System.Guid]::NewGuid().ToString().Substring(0,8))"
    try {
        if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) {
            throw "Git is required to build from source on Windows. Install Git from https://git-scm.com"
        }

        Write-Host "Cloning repository..." -ForegroundColor Cyan
        git clone --depth 1 "https://github.com/$Repo.git" "$TempBuildDir"

        Set-Location "$TempBuildDir"

        if (Get-Command "bun" -ErrorAction SilentlyContinue) {
            Write-Host "Compiling standalone native executable with Bun..." -ForegroundColor Cyan
            bun install
            bun run build:web
            bun build --compile src/index.tsx --outfile "$DestPath" --external playwright --external chromium-bidi
            $Installed = $true
        } elseif (Get-Command "pnpm" -ErrorAction SilentlyContinue) {
            Write-Host "Building with pnpm..." -ForegroundColor Cyan
            pnpm install
            pnpm build
            Copy-Item -Recurse -Path "$TempBuildDir\*" -Destination "$InstallDir\" -Force
            Set-Content -Path "$InstallDir\locus.cmd" -Value "@echo off`r`nnode `"%~dp0dist\index.js`" %*"
            $Installed = $true
        } elseif (Get-Command "npm" -ErrorAction SilentlyContinue) {
            Write-Host "Building with npm..." -ForegroundColor Cyan
            npm install
            npm run build:web
            npx tsc
            Copy-Item -Recurse -Path "$TempBuildDir\*" -Destination "$InstallDir\" -Force
            Set-Content -Path "$InstallDir\locus.cmd" -Value "@echo off`r`nnode `"%~dp0dist\index.js`" %*"
            $Installed = $true
        } else {
            throw "Neither Bun nor Node.js was found. Please install Bun (https://bun.sh) or Node.js (https://nodejs.org)."
        }
    } finally {
        Set-Location $env:USERPROFILE
        Remove-Item -Recurse -Force "$TempBuildDir" -ErrorAction SilentlyContinue
    }
}

# 3. Add to User PATH if not already included
$UserPath = [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::User)
if ($UserPath -notlike "*$InstallDir*") {
    $NewPath = if ([string]::IsNullOrEmpty($UserPath)) { $InstallDir } else { "$InstallDir;$UserPath" }
    [Environment]::SetEnvironmentVariable("PATH", $NewPath, [EnvironmentVariableTarget]::User)
    $env:PATH = "$InstallDir;$env:PATH"
    Write-Host "Added $InstallDir to User PATH." -ForegroundColor Green
}

Write-Host ""
Write-Host "✨ Locus installed successfully to $InstallDir!" -ForegroundColor Green
Write-Host "Restart your PowerShell window or terminal and run 'locus --help' to get started." -ForegroundColor Cyan
