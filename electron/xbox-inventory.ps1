$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$games = @(Get-AppxPackage | Where-Object { -not $_.IsFramework -and -not $_.IsResourcePackage } | ForEach-Object {
    $package = $_
    try {
        $configFile = Join-Path $package.InstallLocation 'MicrosoftGame.config'
        if (-not (Test-Path -LiteralPath $configFile)) { return }
        [xml]$config = Get-Content -LiteralPath $configFile -Raw
        [xml]$manifest = Get-AppxPackageManifest -Package $package.PackageFullName
        $apps = @($manifest.Package.Applications.Application)
        $executable = @($config.Game.ExecutableList.Executable | Where-Object { $_.IsDevOnly -ne 'true' -and $_.TargetDeviceFamily -ne 'XboxOne' -and $_.TargetDeviceFamily -ne 'Scarlett' })[0]
        $application = @($apps | Where-Object { $_.Id -eq $executable.Id })[0]
        if (-not $application) { $application = $apps[0] }
        if (-not $application) { return }
        $name = [string]$config.Game.ShellVisuals.DefaultDisplayName
        if (-not $name -or $name.StartsWith('ms-resource:')) { $name = [string]$manifest.Package.Properties.DisplayName }
        if (-not $name -or $name.StartsWith('ms-resource:')) { $name = $package.Name }
        [pscustomobject]@{
            name = $name
            folder = $package.InstallLocation
            aumid = $package.PackageFamilyName + '!' + $application.Id
            publisher = [string]$config.Game.ShellVisuals.PublisherDisplayName
            description = [string]$config.Game.ShellVisuals.Description
            cover = [string]$config.Game.ShellVisuals.Square480x480Logo
            fallbackCover = [string]$config.Game.ShellVisuals.Square150x150Logo
        }
    } catch { }
})
ConvertTo-Json -InputObject $games -Compress -Depth 4
