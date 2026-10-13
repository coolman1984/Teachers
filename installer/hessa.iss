; Inno Setup script of the Hessa (built by tools/build_windows.py).
; The same Hessa-Setup.exe installs the program on a new PC and updates it on a PC that already has it:
; only the program in Program Files is replaced, the data in %ProgramData%\Hessa is never touched.

#define MyAppName "Hessa"
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef AppPublisher
  #define AppPublisher "Mohamed Fawzy"
#endif
#ifndef AppCopyright
  #define AppCopyright "(c) 2026 Mohamed Fawzy"
#endif
#define HessaUninstallRegKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\{24B39F34-055F-4639-BD93-CF67B335C325}_is1"

[Setup]
AppId={{24B39F34-055F-4639-BD93-CF67B335C325}
AppName={#MyAppName}
AppVersion={#AppVersion}
AppVerName={#MyAppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppCopyright={#AppCopyright}
VersionInfoVersion={#AppVersion}
DefaultDirName={autopf}\Hessa
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
DisableDirPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=Hessa-Setup-{#AppVersion}
SetupIconFile=..\build\hessa.ico
UninstallDisplayIcon={app}\Hessa.exe
UninstallDisplayName={#MyAppName}
LicenseFile=..\LICENSE.txt
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=no

[Languages]
; Arabic first (the centre's language); Inno Setup 6 ships Arabic.isl
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
arabic.DesktopIcon=ضع أيقونة على سطح المكتب
english.DesktopIcon=Put an icon on the desktop
arabic.Firewall=السماح لأجهزة المركز وهواتفه بالاتصال...
english.Firewall=Allowing the centre's other PCs and phones to connect...
arabic.OpenNow=افتح «حصة» الآن
english.OpenNow=Open Hessa now

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"

[InstallDelete]
; older setups used the Startup folder; the server now starts at boot via a scheduled task
Type: files; Name: "{commonstartup}\{#MyAppName}.lnk"

[Dirs]
; ACLs are set in CurStepChanged(ssPostInstall) via icacls (Administrators, LOCAL SERVICE, Users) — not users-modify on the whole tree
Name: "{commonappdata}\Hessa"; Flags: uninsneveruninstall

[Files]
Source: "..\build\hs_main.dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "register_boot_task.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\Hessa.exe"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\Hessa.exe"; Tasks: desktopicon

[Run]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#MyAppName}"""; Flags: runhidden; StatusMsg: "{cm:Firewall}"
; only the centre's own (private or domain) network: a PC on a café or public Wi-Fi never lets strangers in
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""{#MyAppName}"" dir=in action=allow program=""{app}\Hessa.exe"" enable=yes profile=private,domain"; Flags: runhidden
Filename: "{app}\Hessa.exe"; Description: "{cm:OpenNow}"; Flags: nowait postinstall skipifsilent runasoriginaluser
Filename: "{app}\Hessa.exe"; Parameters: "--background"; Flags: nowait runasoriginaluser; Check: WizardSilent

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""Hessa"" /F"; Flags: runhidden; RunOnceId: "DelHessaTask"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Hessa.exe"; Flags: runhidden; RunOnceId: "StopHessa"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""{#MyAppName}"""; Flags: runhidden; RunOnceId: "FirewallRule"

[Messages]
arabic.FinishedLabel=تم تثبيت البرنامج. تُحفظ بياناتك في %ProgramData%\Hessa (وتبقى بعد التحديثات).%n%nإذا لم تتصل الهواتف أو الأجهزة الأخرى: اجعل شبكة المركز «خاصة» (Private) من إعدادات ويندوز ← الشبكة والإنترنت. لا يُسمح بالاتصال على الشبكات العامة حفاظًا على البيانات.
english.FinishedLabel=The program is installed. Your data is kept in %ProgramData%\Hessa (also after updates).%n%nIf phones or other PCs cannot connect: set the centre's network to Private in Windows Settings → Network & Internet. Public networks are never allowed in, to protect the data.

[Code]
const
  UninstallRegKey = '{#HessaUninstallRegKey}';

var
  PostInstallFailed: Boolean;
  PostInstallError: String;

function TryExec(const FileName, Params: String; var Code: Integer): Boolean;
begin
  Result := Exec(FileName, Params, '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

procedure RemoveBootTask;
var
  Code: Integer;
begin
  TryExec(ExpandConstant('{sys}\schtasks.exe'), '/Delete /TN "Hessa" /F', Code);
end;

function RunPostInstall: Boolean;
var
  Code: Integer;
  DataDir, AppDir: String;
begin
  Result := True;
  PostInstallError := '';
  DataDir := ExpandConstant('{commonappdata}\Hessa');
  AppDir := ExpandConstant('{app}');
  if not FileExists(AppDir + '\Hessa.exe') then
  begin
    PostInstallError := 'Hessa.exe was not installed — the setup files may be incomplete.';
    Result := False;
    exit;
  end;
  if not FileExists(AppDir + '\register_boot_task.ps1') then
  begin
    PostInstallError := 'register_boot_task.ps1 was not installed — the setup files may be incomplete.';
    Result := False;
    exit;
  end;
  if not TryExec(ExpandConstant('{sys}\icacls.exe'),
    '"' + DataDir + '" /grant:r *S-1-5-32-544:(OI)(CI)F /grant:r *S-1-5-19:(OI)(CI)M /grant:r *S-1-5-32-545:(OI)(CI)M /T /C',
    Code) or (Code <> 0) then
  begin
    PostInstallError := 'Could not set folder permissions for Hessa (error ' + IntToStr(Code) + ').';
    Result := False;
    exit;
  end;
  if not TryExec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + AppDir + '\register_boot_task.ps1" -ExePath "' + AppDir + '\Hessa.exe"',
    Code) or (Code <> 0) then
  begin
    RemoveBootTask;
    PostInstallError := 'Could not register the Hessa boot task (error ' + IntToStr(Code) + ').';
    Result := False;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  { ssPostInstall runs after files are copied (Inno Setup help); failures set SetupExitCode in DeinitializeSetup }
  if CurStep <> ssPostInstall then
    exit;
  if not RunPostInstall then
  begin
    PostInstallFailed := True;
    MsgBox(
      PostInstallError + #13#10 + #13#10 +
      'The program files were installed, but permissions or the boot task could not be set up. ' +
      'Run the installer again or register the task manually (see docs/OPERATIONS.md).' + #13#10 + #13#10 +
      'تم تثبيت ملفات البرنامج، لكن لم تُضبط الصلاحيات أو مهمة التشغيل. أعد تشغيل المثبّت أو سجّل المهمة يدويًا (راجع docs/OPERATIONS.md).',
      mbError, MB_OK);
  end;
end;

procedure DeinitializeSetup();
begin
  if PostInstallFailed then
    SetupExitCode := 3;
end;

function TryStrToInt(const S: String; var I: Longint): Boolean;
begin
  try
    I := StrToInt(S);
    Result := True;
  except
    Result := False;
  end;
end;

function CompareDotVersions(const A, B: String): Integer;
var
  Pa, Pb: Integer;
  Na, Nb: Longint;
  RestA, RestB: String;
begin
  RestA := A;
  RestB := B;
  while True do
  begin
    Pa := Pos('.', RestA);
    Pb := Pos('.', RestB);
    if Pa = 0 then
    begin
      if not TryStrToInt(RestA, Na) then Na := 0;
      RestA := '';
    end
    else
    begin
      if not TryStrToInt(Copy(RestA, 1, Pa - 1), Na) then Na := 0;
      RestA := Copy(RestA, Pa + 1, MaxInt);
    end;
    if Pb = 0 then
    begin
      if not TryStrToInt(RestB, Nb) then Nb := 0;
      RestB := '';
    end
    else
    begin
      if not TryStrToInt(Copy(RestB, 1, Pb - 1), Nb) then Nb := 0;
      RestB := Copy(RestB, Pb + 1, MaxInt);
    end;
    if Na > Nb then
    begin
      Result := 1;
      exit;
    end;
    if Na < Nb then
    begin
      Result := -1;
      exit;
    end;
    if (RestA = '') and (RestB = '') then
    begin
      Result := 0;
      exit;
    end;
  end;
end;

function InstalledDisplayVersion(): String;
var
  V: String;
begin
  Result := '';
  if RegQueryStringValue(HKLM64, UninstallRegKey, 'DisplayVersion', V) or
     RegQueryStringValue(HKLM32, UninstallRegKey, 'DisplayVersion', V) then
    Result := V;
end;

function InitializeSetup(): Boolean;
var
  Installed: String;
begin
  Result := True;
  Installed := InstalledDisplayVersion();
  if (Installed <> '') and (CompareDotVersions('{#AppVersion}', Installed) < 0) then
  begin
    MsgBox(
      'A newer version of Hessa is already installed (' + Installed + '). This setup is {#AppVersion} and will not replace it.' + #13#10 + #13#10 +
      'يوجد إصدار أحدث من «حصة» مثبّت بالفعل (' + Installed + '). هذا المثبّت إصدار {#AppVersion} ولا يستبدله.',
      mbError, MB_OK);
    Result := False;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  { stop the running program (it is safe to stop at any moment), so its files can be replaced }
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM Hessa.exe', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Sleep(1000);
  if not FileExists(ExpandConstant('{sys}\icacls.exe')) then
  begin
    Result := 'This PC is missing icacls.exe (required to secure the Hessa data folder).';
    exit;
  end;
  if not FileExists(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe')) then
  begin
    Result := 'This PC is missing Windows PowerShell (required to register the Hessa boot task).';
    exit;
  end;
  if not FileExists(ExpandConstant('{sys}\schtasks.exe')) then
  begin
    Result := 'This PC is missing schtasks.exe (required to register the Hessa boot task).';
    exit;
  end;
  Result := '';
end;
