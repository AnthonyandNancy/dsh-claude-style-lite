param(
  [Parameter(Mandatory = $true)][string]$TitleFile,
  [Parameter(Mandatory = $true)][string]$BodyFile,
  [string]$SessionId = '',
  [string]$Kind = 'finished',
  [Parameter(Mandatory = $true)][string]$Aumid,
  [string]$Protocol = 'dsh-claude-style-lite'
)

$ErrorActionPreference = 'Stop'

function Read-Text([string]$Path) {
  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8).Trim()
}

function Register-Protocol([string]$Handler) {
  $root = "HKCU:\Software\Classes\$Protocol"
  New-Item -Path $root -Force | Out-Null
  New-ItemProperty -Path $root -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
  $command = Join-Path $root 'shell\open\command'
  New-Item -Path $command -Force | Out-Null
  New-ItemProperty -Path $command -Name '(Default)' -Value ('wscript.exe //B //Nologo "' + $Handler + '" "%1"') -PropertyType String -Force | Out-Null
}

function Show-Toast([string]$Title, [string]$Body, [string]$Launch) {
  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  $escapedTitle = [System.Security.SecurityElement]::Escape($Title)
  $escapedBody = [System.Security.SecurityElement]::Escape($Body)
  $activation = if ([string]::IsNullOrWhiteSpace($Launch)) { '' } else {
    ' activationType="protocol" launch="' + [System.Security.SecurityElement]::Escape($Launch) + '"'
  }
  $xml = @"
<toast$activation>
  <visual>
    <binding template="ToastGeneric">
      <text>$escapedTitle</text>
      <text>$escapedBody</text>
    </binding>
  </visual>
  <audio silent="true"/>
</toast>
"@
  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $doc.LoadXml($xml)
  $toast = New-Object Windows.UI.Notifications.ToastNotification $doc
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($Aumid).Show($toast)
}

$title = Read-Text $TitleFile
$body = Read-Text $BodyFile
$launch = ''
if (-not [string]::IsNullOrWhiteSpace($SessionId)) {
  $handler = Join-Path $PSScriptRoot 'handler.vbs'
  Register-Protocol $handler
  $launch = $Protocol + '://open?session=' + [uri]::EscapeDataString($SessionId)
}
Show-Toast $title $body $launch
