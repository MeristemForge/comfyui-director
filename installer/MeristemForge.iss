#define AppVersion "0.1.0"
#define SourceDir "..\release\win-unpacked"

[Setup]
AppId={{374F26D0-2D98-5824-9C89-C2D12A321E72}
AppName=MeristemForge
AppVersion={#AppVersion}
AppPublisher=MeristemForge
DefaultDirName={autopf}\MeristemForge
DefaultGroupName=MeristemForge
UninstallDisplayName=MeristemForge
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
OutputDir=..\release
OutputBaseFilename=MeristemForge-Inno-Setup-{#AppVersion}-fixed5
Compression=lzma2/ultra64
SolidCompression=yes
DiskSpanning=no
WizardStyle=modern
SetupIconFile=..\release\.icon-ico\icon.ico
UninstallDisplayIcon={app}\MeristemForge.exe
[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Excludes: "runtime;resources\runtime-archive\runtime.7z"; Flags: ignoreversion overwritereadonly recursesubdirs createallsubdirs
Source: "{#SourceDir}\resources\runtime-archive\runtime.7z"; DestDir: "{app}\resources\runtime-archive"; Flags: ignoreversion overwritereadonly nocompression

[InstallDelete]
; Remove archives from pre-asar builds so Electron cannot load stale code after an upgrade.
Type: files; Name: "{app}\resources\app.asar"
Type: filesandordirs; Name: "{app}\resources\app.asar.unpacked"
; Runtime is installed into the per-user AppData directory now.
Type: filesandordirs; Name: "{app}\runtime"

[Icons]
Name: "{autoprograms}\MeristemForge"; Filename: "{app}\MeristemForge.exe"
Name: "{autodesktop}\MeristemForge"; Filename: "{app}\MeristemForge.exe"

[Code]
var
  ModelDirectoryPage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  ModelDirectoryPage := CreateInputDirPage(
    wpSelectDir,
    '选择模型目录',
    '选择 ComfyUI 模型的保存位置',
    '模型文件不会复制到安装目录。未选择时使用默认目录。',
    False,
    'models'
  );
  ModelDirectoryPage.Add('模型目录:');
  ModelDirectoryPage.Values[0] := ExpandConstant('{userappdata}\MeristemForge\models');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = ModelDirectoryPage.ID then begin
    if Trim(ModelDirectoryPage.Values[0]) = '' then
      ModelDirectoryPage.Values[0] := ExpandConstant('{userappdata}\MeristemForge\models');
    ForceDirectories(ExpandConstant('{userappdata}\MeristemForge'));
    SaveStringToFile(
      ExpandConstant('{userappdata}\MeristemForge\model-directory.txt'),
      ModelDirectoryPage.Values[0] + #13#10,
      False
    );
  end;
end;

procedure ExtractRuntime;
var
  ExtractorPath, ArchivePath, InstallRoot, RuntimeRoot: string;
  ResultCode: Integer;
begin
  InstallRoot := ExpandConstant('{app}');
  RuntimeRoot := ExpandConstant('{userappdata}\MeristemForge');
  ForceDirectories(RuntimeRoot);
  if FileExists(RuntimeRoot + '\runtime\ComfyUI\main.py') then
    exit;

  ExtractorPath := InstallRoot + '\resources\runtime-extractor\7z.exe';
  ArchivePath := InstallRoot + '\resources\runtime-archive\runtime.7z';
  if (not FileExists(ExtractorPath)) or (not FileExists(ArchivePath)) then begin
    MsgBox('安装包缺少 ComfyUI runtime 文件。', mbError, MB_OK);
    Abort;
  end;

  if (not Exec(
    ExtractorPath,
    'x -y "' + ArchivePath + '" "-o' + RuntimeRoot + '"',
    InstallRoot + '\resources\runtime-extractor',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  )) or (ResultCode <> 0) then begin
    MsgBox('ComfyUI runtime 解压失败，请检查磁盘空间后重试。', mbError, MB_OK);
    Abort;
  end;

  if not FileExists(RuntimeRoot + '\runtime\ComfyUI\main.py') then begin
    MsgBox('runtime 解压完成，但没有找到 ComfyUI 主程序。', mbError, MB_OK);
    Abort;
  end;

  DeleteFile(ArchivePath);
  DeleteFile(InstallRoot + '\resources\runtime-extractor\7z.exe');
  DeleteFile(InstallRoot + '\resources\runtime-extractor\7z.dll');
  RemoveDir(InstallRoot + '\resources\runtime-archive');
  RemoveDir(InstallRoot + '\resources\runtime-extractor');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    ExtractRuntime;
end;
