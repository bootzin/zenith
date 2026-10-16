<#
.SYNOPSIS
  Installs Zenith and Zenith Plus into a Zen profile as local mods, or
  restores the profile. This is the manual way in; Zenith's six mods can
  also come from Zen's mod store, and Zenith Plus from Sine.

.DESCRIPTION
  Install (default):
    1. Refuses to run while Zen is open (Zen rewrites these files on exit).
    2. Backs up zen-themes.json, chrome\zen-themes.css, chrome\userContent.css
       and the prefs Zenith touches into <profile>\zenith-backups\<timestamp>\.
    3. Trial mode: switches every other mod off (nothing is deleted).
    4. Copies the six Zenith mods and Zenith Plus (its styles and settings)
       into chrome\zen-themes\<id>\ and lists them first in zen-themes.json.
    5. Installs the Zenith Plus scripts and the script loader's profile half
       (fx-autoconfig). Its program half needs admin rights; see
       vendor\fx-autoconfig. -WithoutPlus skips all of Plus.
    6. Sets the handful of Zen/Firefox prefs Zenith relies on (see $Prefs).
    7. Regenerates chrome\zen-themes.css, because Zen only rebuilds that
       file when mods change while it's running.

  -Restore puts back the oldest backup, i.e. the profile as it was before
  Zenith: mod list, stylesheet, userContent.css and the original values of
  every pref Zenith changed.

  -Finalize (after you've tried Zenith) deletes the old mods' folders and
  removes them from zen-themes.json. Backups stay.

  With Sine installed (its engine in chrome\JS), Zen's own mod list is
  gone: install and -Update then put Zenith into Sine's mod list
  (chrome\sine-mods) instead, with Plus's scripts registered there, and the
  script loader steps are skipped (Sine is the loader).

  -Update refreshes an existing install with the latest files (styles,
  settings lists, readmes, scripts), adds any Zenith mod that is new since
  the install, records the version in zen-themes.json and regenerates
  zen-themes.css. It never touches prefs.js. Close Zen first when a new mod
  is being added; otherwise restart Zen to load the changes.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1
  powershell -ExecutionPolicy Bypass -File install.ps1 -Restore
#>
param(
    [string]$ProfilePath,
    [switch]$Restore,
    [switch]$Finalize,
    [switch]$Update,
    # Install only the six CSS mods (what Zen's mod store would give you).
    [switch]$WithoutPlus,
    # Only for dry runs against a copied profile folder.
    [switch]$AllowRunning
)

$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Root = Split-Path -Parent $PSScriptRoot
# One version for Zenith and Zenith Plus (bump it with tools/bump_version.py).
$Version = ([System.IO.File]::ReadAllText((Join-Path $Root 'VERSION'))).Trim()

# Fixed ids so reinstalling updates the same mods. Order = load order.
$Mods = [ordered]@{
    'core'   = @{ Id = '5a0e7c11-2e1b-4c7d-9f3a-0c0de0000001'; Dir = 'core';        Name = 'Zenith Core';    Desc = 'Shared colours, sizes, transparency and the page frame. Required by the other Zenith mods.' }
    'edges'  = @{ Id = '5a0e7c11-2e1b-4c7d-9f3a-0c0de0000002'; Dir = 'edges';       Name = 'Zenith Edges';   Desc = 'Hairline status edges: loading, downloads, containers, sharing, private.' }
    'tabs'   = @{ Id = '5a0e7c11-2e1b-4c7d-9f3a-0c0de0000003'; Dir = 'tabs';        Name = 'Zenith Tabs';    Desc = 'Tight tab sidebar with only the signals that matter.' }
    'urlbar' = @{ Id = '5a0e7c11-2e1b-4c7d-9f3a-0c0de0000004'; Dir = 'urlbar';      Name = 'Zenith URL bar'; Desc = 'Floating URL bar with dense results.' }
    'panels' = @{ Id = '5a0e7c11-2e1b-4c7d-9f3a-0c0de0000005'; Dir = 'panels';      Name = 'Zenith Panels';  Desc = 'Find bar, history, status pill, Glance, split view, notifications, menus.' }
    'motion' = @{ Id = '5a0e7c11-2e1b-4c7d-9f3a-0c0de0000006'; Dir = 'motion';      Name = 'Zenith Motion';  Desc = 'One motion language: Quick or Smooth, crossfade and swipe.' }
    'plus'   = @{ Id = '5a0e7c11-2e1b-4c7d-9f3a-0c0de0000007'; Dir = 'plus';         Name = 'Zenith Plus';    Desc = 'Peek, real load and download progress, minimap, zoom pills and more. Needs its scripts.' }
}
if ($WithoutPlus) { $Mods.Remove('plus') }

# Prefs Zenith sets on install. Values are written as JS literals.
$Prefs = [ordered]@{
    'browser.tabs.allow_transparent_browser'               = 'false'  # Transparent Zen asks for this before removal
    'toolkit.legacyUserProfileCustomizations.stylesheets'  = 'true'   # lets the profile's chrome folder load styles and scripts
    'zen.theme.acrylic-sidebar'                            = 'true'   # frosted compact sidebar
    'zen.theme.acrylic-urlbar'                             = 'true'   # frosted URL bar
    'zen.view.enable-loading-indicator'                    = 'true'   # Zenith restyles this bar into the load edge
}
# Only with Zenith Plus: lets fx-autoconfig run Plus's settings helper inside
# Zen's settings page (an in-tab page it skips by default).
if (-not $WithoutPlus) { $Prefs['userChromeJS.persistent_domcontent_callback'] = 'true' }

function Write-Utf8([string]$Path, [string]$Text) {
    [System.IO.File]::WriteAllText($Path, $Text, $Utf8)
}

function Find-ZenProfile {
    $ini = Join-Path $env:APPDATA 'zen\installs.ini'
    if (-not (Test-Path $ini)) { throw "Can't find $ini. Pass -ProfilePath." }
    $line = Get-Content $ini | Where-Object { $_ -like 'Default=*' } | Select-Object -First 1
    if (-not $line) { throw "No default profile in $ini. Pass -ProfilePath." }
    return Join-Path (Join-Path $env:APPDATA 'zen') ($line.Substring(8) -replace '/', '\')
}

function Read-Json([string]$Path) {
    $raw = [System.IO.File]::ReadAllText($Path, $Utf8)
    # PowerShell 5.1's ConvertFrom-Json has no ordered-hashtable mode, so go
    # through the .NET serializer to keep key order (it decides load order).
    Add-Type -AssemblyName System.Web.Extensions
    $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $ser.MaxJsonLength = [int]::MaxValue
    return $ser.DeserializeObject($raw)
}

function ConvertTo-JsonText($Value) {
    # Hand-rolled because .NET's serializer trips over PowerShell's object
    # wrappers; this unwraps them and keeps key order.
    if ($null -eq $Value) { return 'null' }
    if ($Value -is [System.Management.Automation.PSObject]) { $Value = $Value.PSObject.BaseObject }
    if ($Value -is [string]) {
        $sb = New-Object System.Text.StringBuilder
        [void]$sb.Append('"')
        foreach ($ch in $Value.ToCharArray()) {
            switch ($ch) {
                '"' { [void]$sb.Append('\"') }
                '\' { [void]$sb.Append('\\') }
                "`n" { [void]$sb.Append('\n') }
                "`r" { [void]$sb.Append('\r') }
                "`t" { [void]$sb.Append('\t') }
                default {
                    if ([int]$ch -lt 0x20) { [void]$sb.AppendFormat('\u{0:x4}', [int]$ch) }
                    else { [void]$sb.Append($ch) }
                }
            }
        }
        [void]$sb.Append('"')
        return $sb.ToString()
    }
    if ($Value -is [bool]) { if ($Value) { return 'true' } else { return 'false' } }
    if ($Value -is [System.ValueType]) { return [System.Convert]::ToString($Value, [System.Globalization.CultureInfo]::InvariantCulture) }
    if ($Value -is [System.Collections.IDictionary]) {
        $parts = foreach ($k in $Value.Keys) { (ConvertTo-JsonText ([string]$k)) + ':' + (ConvertTo-JsonText $Value[$k]) }
        return '{' + ($parts -join ',') + '}'
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        $parts = foreach ($item in $Value) { ConvertTo-JsonText $item }
        return '[' + ($parts -join ',') + ']'
    }
    return ConvertTo-JsonText ([string]$Value)
}

function Write-Json([string]$Path, $Object) {
    Write-Utf8 $Path (ConvertTo-JsonText $Object)
}

function Get-PrefLine([string[]]$Lines, [string]$Name) {
    $needle = 'user_pref("' + $Name + '",'
    return $Lines | Where-Object { $_.StartsWith($needle) } | Select-Object -First 1
}

function Set-Prefs([string]$PrefsPath, $Values) {
    # $Values: name -> JS literal, or $null to remove the line (back to default).
    $lines = [System.Collections.Generic.List[string]]([System.IO.File]::ReadAllLines($PrefsPath, $Utf8))
    foreach ($name in $Values.Keys) {
        $needle = 'user_pref("' + $name + '",'
        for ($i = $lines.Count - 1; $i -ge 0; $i--) {
            if ($lines[$i].StartsWith($needle)) { $lines.RemoveAt($i) }
        }
        if ($null -ne $Values[$name]) {
            $lines.Add('user_pref("' + $name + '", ' + $Values[$name] + ');')
        }
    }
    Write-Utf8 $PrefsPath (($lines -join "`n") + "`n")
}

# Script file names Zenith used before (removed on install and restore).
$LegacyScripts = @('zenith.uc.mjs')

function Install-Scripts([string]$ChromeDir) {
    # fx-autoconfig's profile half (its program half lives in Zen's install
    # folder and needs admin rights; see vendor/fx-autoconfig) plus the
    # Zenith Plus scripts. The marker lets -Restore remove only what Zenith
    # put there.
    $utils = Join-Path $ChromeDir 'utils'
    New-Item -ItemType Directory -Force $utils, (Join-Path $ChromeDir 'JS') | Out-Null
    Copy-Item (Join-Path $Root 'vendor\fx-autoconfig\utils\*') $utils -Force
    Set-Content (Join-Path $utils '.installed-by-zenith') 'fx-autoconfig 0.10.16'
    foreach ($old in $LegacyScripts) {
        $f = Join-Path $ChromeDir "JS\$old"
        if (Test-Path $f) { Remove-Item $f }
    }
    Get-ChildItem (Join-Path $Root 'plus\scripts') -Filter '*.uc.*' | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $ChromeDir "JS\$($_.Name)") -Force
    }
    if (-not (Test-Path 'C:\Program Files\Zen Browser\config.js')) {
        Write-Warning "fx-autoconfig's config.js is missing from Zen's program folder (a Zen update can remove it); Zenith's script won't run until it's copied back."
    }
}

function Clear-StartupCache([string]$ProfileDir) {
    # The script loader caches scripts; Zen rebuilds this cache on start.
    $local = $ProfileDir.Replace($env:APPDATA, $env:LOCALAPPDATA)
    $cache = Join-Path $local 'startupCache'
    if ((Test-Path $cache) -and -not (Get-Process -Name zen -ErrorAction SilentlyContinue)) {
        Remove-Item $cache -Recurse -Force
        Write-Host 'Cleared Zen''s startup cache so the updated script loads.'
    } elseif (Test-Path $cache) {
        Write-Host 'Zen is open: after restarting it, use about:support > Clear startup cache once to load the updated script.'
    }
}

function Copy-ModFiles($Mod) {
    $src = Join-Path $Root $Mod.Dir
    $dst = Join-Path $Chrome "zen-themes\$($Mod.Id)"
    New-Item -ItemType Directory -Force $dst | Out-Null
    foreach ($f in 'chrome.css', 'preferences.json', 'readme.md') {
        if (Test-Path (Join-Path $src $f)) { Copy-Item (Join-Path $src $f) $dst -Force }
    }
}

function New-ModEntry($Mod, $Existing, [string]$Today) {
    # Plain .NET values only: the serializer can't handle PowerShell wrappers.
    $entry = New-Object 'System.Collections.Generic.Dictionary[string,object]'
    $entry.Add('id', [string]$Mod.Id)
    $entry.Add('name', [string]$Mod.Name)
    $entry.Add('description', [string]$Mod.Desc)
    foreach ($empty in 'homepage', 'style', 'readme', 'image') { $entry.Add($empty, '') }
    $entry.Add('preferences', 'local')   # must be truthy or Zen ignores preferences.json
    $entry.Add('author', 'zenith-local')
    $entry.Add('version', $Version)
    $entry.Add('tags', [object[]]@())
    $created = $Today
    if ($Existing -and $Existing['createdAt']) { $created = [string]$Existing['createdAt'] }
    $entry.Add('createdAt', [string]$created)
    $entry.Add('updatedAt', [string]$Today)
    $enabled = $true
    if ($Existing -and $Existing.ContainsKey('enabled')) { $enabled = [bool]$Existing['enabled'] }
    $entry.Add('enabled', [bool]$enabled)
    return $entry
}

function Test-Sine {
    return (Test-Path (Join-Path $Chrome 'JS\sine.sys.mjs'))
}

function Install-ToSine {
    # Sine keeps mods in chrome\sine-mods\<id>\ and lists them in
    # chrome\sine-mods\mods.json; it rebuilds its stylesheet on start.
    $sineMods = Join-Path $Chrome 'sine-mods'
    $sineData = Join-Path $sineMods 'mods.json'
    New-Item -ItemType Directory -Force $sineMods | Out-Null
    if (Test-Path $sineData) { $data = Read-Json $sineData }
    else { $data = New-Object 'System.Collections.Generic.Dictionary[string,object]' }
    $plusManifest = Read-Json (Join-Path $Root 'plus\theme.json')
    $today = Get-Date -Format 'yyyy-MM-dd'
    foreach ($m in $Mods.Values) {
        $src = Join-Path $Root $m.Dir
        $dst = Join-Path $sineMods $m.Id
        New-Item -ItemType Directory -Force $dst | Out-Null
        foreach ($f in 'chrome.css', 'preferences.json', 'readme.md') {
            if (Test-Path (Join-Path $src $f)) { Copy-Item (Join-Path $src $f) $dst -Force }
        }
        $existing = $null
        if ($data.ContainsKey($m.Id)) { $existing = $data[$m.Id] }
        $entry = New-ModEntry $m $existing $today
        $style = New-Object 'System.Collections.Generic.Dictionary[string,object]'
        $style.Add('chrome', 'chrome.css')
        $entry['style'] = $style
        $entry['preferences'] = 'preferences.json'
        $entry['homepage'] = ''
        # A local copy: nothing to update from (Sine would try the homepage).
        $entry['no-updates'] = $true
        if ($m.Dir -eq 'plus') {
            New-Item -ItemType Directory -Force (Join-Path $dst 'scripts') | Out-Null
            Get-ChildItem (Join-Path $Root 'plus\scripts') -Filter '*.uc.mjs' | ForEach-Object {
                Copy-Item $_.FullName (Join-Path $dst "scripts\$($_.Name)") -Force
            }
            $entry['scripts'] = $plusManifest['scripts']
        }
        $data[$m.Id] = $entry
    }
    Write-Json $sineData $data
    # Sine moves anything still in Zen's own mod list into its own on start;
    # Zenith is already there, so take it out of Zen's list.
    if (Test-Path $ThemesJson) {
        $zen = Read-Json $ThemesJson
        foreach ($m in $Mods.Values) { [void]$zen.Remove($m.Id) }
        Write-Json $ThemesJson $zen
    }
    # Scripts the fx-autoconfig install left in chrome\JS (Sine's own folder).
    $names = @(Get-ChildItem (Join-Path $Root 'plus\scripts') -Filter '*.uc.*' | ForEach-Object { $_.Name }) + $LegacyScripts
    foreach ($name in $names) {
        $f = Join-Path $Chrome "JS\$name"
        if (Test-Path $f) { Remove-Item $f }
    }
}

function Build-ZenThemesCss([string]$ProfileDir, $ModsJson) {
    $stamp = Get-Date -Format 'dddd, MMMM d, yyyy \a\t h:mm:ss tt'
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append("/* Zen Mods - Generated by ZenMods.`n* FILE GENERATED AT: $stamp`n")
    [void]$sb.Append("* DO NOT EDIT THIS FILE DIRECTLY!`n* Your changes will be overwritten.`n* Instead, go to the preferences and edit the mods there.`n*/`n")
    foreach ($id in $ModsJson.Keys) {
        $mod = $ModsJson[$id]
        if ($mod.ContainsKey('enabled') -and -not $mod['enabled']) { continue }
        $css = Join-Path $ProfileDir "chrome\zen-themes\$id\chrome.css"
        if (-not (Test-Path $css)) { continue }
        [void]$sb.Append("`n/* Name: $($mod['name']) */`n/* Description: $($mod['description']) */`n/* Author: @$($mod['author']) */`n")
        [void]$sb.Append([System.IO.File]::ReadAllText($css, $Utf8))
    }
    [void]$sb.Append("`n/* End of Zen Mods */`n")
    Write-Utf8 (Join-Path $ProfileDir 'chrome\zen-themes.css') $sb.ToString()
}

# ---------------------------------------------------------------------------

if (-not $Update -and -not $AllowRunning -and (Get-Process -Name zen -ErrorAction SilentlyContinue)) {
    throw 'Zen is running. Close every Zen window, then run this again.'
}

if (-not $ProfilePath) { $ProfilePath = Find-ZenProfile }
$ProfilePath = (Resolve-Path $ProfilePath).Path
$ThemesJson = Join-Path $ProfilePath 'zen-themes.json'
$PrefsJs = Join-Path $ProfilePath 'prefs.js'
$Chrome = Join-Path $ProfilePath 'chrome'
$BackupRoot = Join-Path $ProfilePath 'zenith-backups'
Write-Host "Profile: $ProfilePath"

if ($Restore) {
    # The oldest backup is the profile as it was before Zenith ever touched it.
    $first = Get-ChildItem $BackupRoot -Directory | Where-Object { $_.Name -match '^\d{8}-\d{6}$' } |
        Sort-Object Name | Select-Object -First 1
    if (-not $first) { throw "No backups in $BackupRoot" }
    $b = $first.FullName
    Copy-Item (Join-Path $b 'zen-themes.json') $ThemesJson -Force
    Copy-Item (Join-Path $b 'zen-themes.css') (Join-Path $Chrome 'zen-themes.css') -Force
    $uc = Join-Path $Chrome 'userContent.css'
    if (Test-Path (Join-Path $b 'userContent.css')) { Copy-Item (Join-Path $b 'userContent.css') $uc -Force }
    elseif (Test-Path $uc) { Remove-Item $uc }
    $orig = Get-Content (Join-Path $b 'prefs-before.json') -Raw | ConvertFrom-Json
    $values = [ordered]@{}
    foreach ($p in $orig.PSObject.Properties) { $values[$p.Name] = $p.Value }
    Set-Prefs $PrefsJs $values
    # Undo what the Zenith script changed at runtime: the "animate even when
    # Windows animation effects are off" override (only if Zenith set it),
    # and its own bookkeeping prefs.
    $current = [System.IO.File]::ReadAllLines($PrefsJs, $Utf8)
    $runtime = [ordered]@{}
    if (Get-PrefLine $current 'zenith.internal.motion-override' | Where-Object { $_ -match 'true' }) {
        $runtime['ui.prefersReducedMotion'] = $null
    }
    # Set by -Update for Zenith Plus's settings helper (not in older backups).
    $runtime['userChromeJS.persistent_domcontent_callback'] = $null
    foreach ($line in $current) {
        if ($line -match '^user_pref\("(zenith\.internal\.[^"]+)"') { $runtime[$Matches[1]] = $null }
    }
    if ($runtime.Count) { Set-Prefs $PrefsJs $runtime }
    foreach ($m in $Mods.Values) {
        $dir = Join-Path $Chrome "zen-themes\$($m.Id)"
        if (Test-Path $dir) { Remove-Item $dir -Recurse }
    }
    # With Sine: take Zenith out of Sine's mod list too.
    $sineData = Join-Path $Chrome 'sine-mods\mods.json'
    if (Test-Path $sineData) {
        $data = Read-Json $sineData
        foreach ($m in $Mods.Values) {
            [void]$data.Remove($m.Id)
            $dir = Join-Path $Chrome "sine-mods\$($m.Id)"
            if (Test-Path $dir) { Remove-Item $dir -Recurse }
        }
        Write-Json $sineData $data
        Write-Host 'Removed Zenith from Sine''s mod list (Sine itself stays installed).'
    }
    # Zenith Plus's scripts and the loader's profile half (if Zenith put it there).
    $names = @(Get-ChildItem (Join-Path $Root 'plus\scripts') -Filter '*.uc.*' | ForEach-Object { $_.Name }) + $LegacyScripts
    foreach ($name in $names) {
        $f = Join-Path $Chrome "JS\$name"
        if (Test-Path $f) { Remove-Item $f }
    }
    if (Test-Path (Join-Path $Chrome 'utils\.installed-by-zenith')) { Remove-Item (Join-Path $Chrome 'utils') -Recurse }
    Write-Host "fx-autoconfig's two files in Zen's program folder are left in place (removing them needs admin): config.js and defaults\pref\config-prefs.js."
    # Bring back folders that -Finalize parked.
    $parked = Join-Path $BackupRoot 'removed-mods'
    if (Test-Path $parked) {
        foreach ($dir in Get-ChildItem $parked -Directory) {
            $target = Join-Path $Chrome "zen-themes\$($dir.Name)"
            if (-not (Test-Path $target)) { Move-Item $dir.FullName $target }
        }
    }
    Write-Host "Restored from $b"
    return
}

# The CSS check is a development safeguard; people installing a release
# usually don't have Python, so it only runs when Python is there.
function Test-Css([string]$Action) {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) { return }
    if (-not (Test-Path (Join-Path $PSScriptRoot 'check_css.py'))) { return }
    & python -I (Join-Path $PSScriptRoot 'check_css.py') $Root
    if ($LASTEXITCODE -ne 0) { throw "CSS check failed; not $Action." }
}

if ($Update -and (Test-Sine)) {
    Test-Css 'updating'
    Install-ToSine
    Clear-StartupCache $ProfilePath
    Write-Host "Zenith $Version installed into Sine. Restart Zen to load it."
    if ($Mods.Contains('plus')) {
        Write-Host 'Zenith Plus scripts run once Sine''s "Allow JS from unofficial sources" is on (Settings > Sine).'
    }
    return
}

if ($Update) {
    Test-Css 'updating'
    if (-not (Test-Path (Join-Path $Chrome "zen-themes\$($Mods['core'].Id)"))) {
        throw "Zenith isn't installed in this profile yet; run without -Update first."
    }
    $json = Read-Json $ThemesJson
    $today = Get-Date -Format 'yyyy-MM-dd'
    $added = @()
    foreach ($m in $Mods.Values) {
        Copy-ModFiles $m
        if ($json.ContainsKey($m.Id)) {
            # Record the new version on each Zenith entry in Zen's mod list.
            $json[$m.Id]['version'] = $Version
            $json[$m.Id]['description'] = $m.Desc
            $json[$m.Id]['updatedAt'] = $today
        } else {
            $json[$m.Id] = New-ModEntry $m $null $today
            $added += $m.Name
        }
    }
    if ($added.Count -and (Get-Process -Name zen -ErrorAction SilentlyContinue)) {
        Write-Warning "Zen is open: it may forget the newly added $($added -join ', ') when it saves its mod list. If it's missing after a restart, close Zen and run -Update again."
    }
    foreach ($name in $added) { Write-Host "Added: $name" }
    # The page stylesheet Zenith used to install is gone; remove its stub.
    $uc = Join-Path $Chrome 'userContent.css'
    if ((Test-Path $uc) -and ((Get-Content $uc -Raw) -match 'Zenith page styles')) { Remove-Item $uc }
    if ($Mods.Contains('plus')) {
        Install-Scripts $Chrome
        # Plus's settings helper needs fx-autoconfig to run inside Zen's
        # settings page; prefs.js can only be edited while Zen is closed.
        $flag = 'userChromeJS.persistent_domcontent_callback'
        if (-not (Get-PrefLine ([System.IO.File]::ReadAllLines($PrefsJs, $Utf8)) $flag)) {
            if (Get-Process -Name zen -ErrorAction SilentlyContinue) {
                Write-Warning "Close Zen and run -Update again to switch on Plus's settings helper."
            } else {
                Set-Prefs $PrefsJs ([ordered]@{ $flag = 'true' })
                Write-Host 'Switched on the script loader for Zen''s settings page (settings helper).'
            }
        }
    }
    Write-Json $ThemesJson $json
    Build-ZenThemesCss $ProfilePath $json
    Clear-StartupCache $ProfilePath
    Write-Host "Zenith $Version installed over the previous version. Restart Zen to load it."
    return
}

if ($Finalize) {
    $json = Read-Json $ThemesJson
    $zenithIds = $Mods.Values | ForEach-Object { $_.Id }
    $kept = New-Object 'System.Collections.Generic.Dictionary[string,object]'
    $parked = Join-Path $BackupRoot 'removed-mods'
    New-Item -ItemType Directory -Force $parked | Out-Null
    foreach ($id in $json.Keys) {
        if ($zenithIds -contains $id) { $kept[$id] = $json[$id]; continue }
        $dir = Join-Path $Chrome "zen-themes\$id"
        # Moved, not deleted, so a removed mod can still be brought back by hand.
        if (Test-Path $dir) { Move-Item $dir (Join-Path $parked $id) -Force }
        Write-Host "Removed old mod: $($json[$id]['name'])"
    }
    Write-Json $ThemesJson $kept
    Build-ZenThemesCss $ProfilePath $kept
    return
}

# --- Install -----------------------------------------------------------------

Test-Css 'installing'

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Force $backup | Out-Null
Copy-Item $ThemesJson $backup
Copy-Item (Join-Path $Chrome 'zen-themes.css') $backup
Copy-Item (Join-Path $Chrome 'zen-themes') (Join-Path $backup 'zen-themes') -Recurse
if (Test-Path (Join-Path $Chrome 'userContent.css')) { Copy-Item (Join-Path $Chrome 'userContent.css') $backup }

$prefLines = [System.IO.File]::ReadAllLines($PrefsJs, $Utf8)
$before = [ordered]@{}
foreach ($name in $Prefs.Keys) {
    $line = Get-PrefLine $prefLines $name
    if ($line) {
        $value = $line.Substring(('user_pref("' + $name + '", ').Length).TrimEnd(';', ')', ' ')
        $before[$name] = $value
    } else {
        $before[$name] = $null
    }
}
Write-Utf8 (Join-Path $backup 'prefs-before.json') ($before | ConvertTo-Json)
Write-Host "Backup: $backup"

$json = Read-Json $ThemesJson
$zenithIds = $Mods.Values | ForEach-Object { $_.Id }
$today = Get-Date -Format 'yyyy-MM-dd'
$ordered = New-Object 'System.Collections.Generic.Dictionary[string,object]'

foreach ($m in $Mods.Values) {
    Copy-ModFiles $m
    $ordered[$m.Id] = New-ModEntry $m $json[$m.Id] $today
}

foreach ($id in $json.Keys) {
    if ($zenithIds -contains $id) { continue }
    $mod = $json[$id]
    if ($mod['enabled']) { Write-Host "Switched off for the trial: $($mod['name'])" }
    $mod['enabled'] = $false
    $ordered[$id] = $mod
}

Write-Json $ThemesJson $ordered
Set-Prefs $PrefsJs $Prefs
if (Test-Sine) {
    Install-ToSine
} elseif ($Mods.Contains('plus')) {
    Install-Scripts $Chrome
}
Build-ZenThemesCss $ProfilePath $ordered
Clear-StartupCache $ProfilePath
Write-Host 'Zenith installed. Start Zen to try it; run with -Restore to undo.'
