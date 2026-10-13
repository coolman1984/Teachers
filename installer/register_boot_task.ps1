# Registers the Hessa boot task (called from hessa.iss at install time).
# Requires administrator. The task runs as LOCAL SERVICE (not SYSTEM) with no 72h cap,
# battery-friendly settings, and restart on failure.
param(
    [Parameter(Mandatory = $true)]
    [string]$ExePath
)

$ErrorActionPreference = 'Stop'
$ExePath = $ExePath.Trim('"')
if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "Hessa.exe not found: $ExePath"
}

$taskName = 'Hessa'
$exeDir = Split-Path -Parent $ExePath

# LOCAL SERVICE must read the program and write %ProgramData%\Hessa (installer grants via icacls).
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Hessa centre server at Windows startup</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-19</UserId>
      <LogonType>ServiceAccount</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$ExePath</Command>
      <Arguments>--background</Arguments>
      <WorkingDirectory>$exeDir</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

$xmlPath = Join-Path $env:TEMP 'hessa-boot-task.xml'
$xml | Out-File -LiteralPath $xmlPath -Encoding Unicode -Force

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
Register-ScheduledTask -TaskName $taskName -Xml (Get-Content -LiteralPath $xmlPath -Raw) -Force | Out-Null
Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if (-not $task -or $task.State -eq 'Disabled') {
    throw "Scheduled task $taskName was not registered."
}
$principal = $task.Principal
if ($principal.LogonType -ne 'ServiceAccount' -or $principal.UserId -notmatch 'S-1-5-19|LOCAL SERVICE') {
    throw "Scheduled task $taskName has the wrong run-as account."
}
