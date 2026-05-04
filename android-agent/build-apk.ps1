# Compila el APK en Windows: corrige JAVA_HOME roto y busca JDK 17+ (Temurin, Android Studio JBR, etc.)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Clear-BadJavaHome {
    if ($env:JAVA_HOME -and -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
        Write-Warning "JAVA_HOME no valido ($env:JAVA_HOME). Se ignorara para esta compilacion."
        Remove-Item Env:JAVA_HOME -ErrorAction SilentlyContinue
    }
}

function Test-JavaMajorAtLeast {
    param([string]$JavaExe, [int]$MinMajor)
    # java -version escribe en stderr; cmd evita que PowerShell lo trate como error terminante
    $out = cmd /c "`"$JavaExe`" -version 2>&1"
    $legacy = [regex]::Match($out, 'version "1\.(\d+)')
    if ($legacy.Success) {
        return [int]$legacy.Groups[1].Value -ge $MinMajor
    }
    $modern = [regex]::Match($out, 'version "(\d+)')
    if ($modern.Success) {
        return [int]$modern.Groups[1].Value -ge $MinMajor
    }
    return $false
}

function Find-Jdk17Plus {
    $bases = @(
        "$env:ProgramFiles\Eclipse Adoptium",
        "$env:ProgramFiles\Java",
        "${env:ProgramFiles(x86)}\Java",
        "$env:LOCALAPPDATA\Programs\Eclipse Adoptium",
        "$env:ProgramFiles\Android\Android Studio\jbr",
        "$env:LOCALAPPDATA\Programs\Android\Android Studio\jbr"
    )
    foreach ($base in $bases) {
        if (-not (Test-Path $base)) { continue }
        $jdkCandidates = @()
        $javaExe = Join-Path $base 'bin\java.exe'
        if (Test-Path $javaExe) {
            $jdkCandidates += $base
        }
        Get-ChildItem $base -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            $je = Join-Path $_.FullName 'bin\java.exe'
            if (Test-Path $je) { $jdkCandidates += $_.FullName }
        }
        foreach ($candidate in ($jdkCandidates | Select-Object -Unique)) {
            $je = Join-Path $candidate 'bin\java.exe'
            if ((Test-Path $je) -and (Test-JavaMajorAtLeast -JavaExe $je -MinMajor 17)) {
                return $candidate
            }
        }
    }
    return $null
}

Clear-BadJavaHome

if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    $jdk = Find-Jdk17Plus
    if ($jdk) {
        $env:JAVA_HOME = $jdk
        Write-Host "Usando JDK 17+: $jdk"
    }
}

if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    Write-Error @"
No se encontro JDK 17+. Android Gradle Plugin 8.x lo requiere.

Instala Temurin 17 (https://adoptium.net/) o Android Studio y ejecuta de nuevo.
Si JAVA_HOME apunta a una carpeta borrada, corrigelo en Variables de entorno de Windows.
"@
}

function Resolve-AndroidSdkRoot {
    foreach ($candidate in @(
            $env:ANDROID_SDK_ROOT,
            $env:ANDROID_HOME,
            "$env:LOCALAPPDATA\Android\Sdk",
            "$env:USERPROFILE\AppData\Local\Android\Sdk"
        )) {
        if (-not $candidate) { continue }
        if (Test-Path (Join-Path $candidate 'platforms')) {
            return $candidate
        }
    }
    return $null
}

$sdkRoot = Resolve-AndroidSdkRoot
if (-not $sdkRoot) {
    Write-Error @"
No se encontro Android SDK (carpeta platforms).

Instala Android Studio y abre SDK Manager, o define ANDROID_HOME / ANDROID_SDK_ROOT
apuntando al SDK (suele ser %LOCALAPPDATA%\Android\Sdk).
"@
}
if (-not (Test-Path (Join-Path $sdkRoot 'platforms\android-34'))) {
    Write-Error @"
El SDK no tiene instalada la plataforma Android 14 (API 34).

En Android Studio: Settings > Android SDK > SDK Platforms > Android 14 (API 34).
O con sdkmanager: sdkmanager `"platforms;android-34`" `"build-tools;34.0.0`"
"@
}
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
Write-Host "Usando Android SDK: $sdkRoot"

if (-not (Test-Path 'gradle\wrapper\gradle-wrapper.jar')) {
    Write-Error 'Falta gradle\wrapper\gradle-wrapper.jar. Clona el repo completo o ejecuta setup.sh / setup Git Bash.'
}

if ($args.Count -eq 0) {
    & .\gradlew.bat assembleDebug --no-daemon @('--stacktrace')
} else {
    & .\gradlew.bat @args
}
exit $LASTEXITCODE
