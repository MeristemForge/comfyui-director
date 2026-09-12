!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var ModelDirControl
Var ModelDirValue

Function meristemforgeModelPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 28u "选择模型目录"
  Pop $0
  ${NSD_CreateLabel} 0 20u 100% 28u "模型文件不会复制到安装目录。未选择时将使用用户 AppData 中的默认目录。"
  Pop $0
  ${NSD_CreateText} 0 54u 78% 13u "$APPDATA\MeristemForge\models"
  Pop $ModelDirControl
  ${NSD_CreateButton} 80% 54u 20% 13u "浏览..."
  Pop $0
  ${NSD_OnClick} $0 meristemforgeBrowseModelDir
  nsDialogs::Show
FunctionEnd

Function meristemforgeBrowseModelDir
  ${NSD_GetText} $ModelDirControl $ModelDirValue
  nsDialogs::SelectFolderDialog "选择模型目录" "$ModelDirValue"
  Pop $0
  ${IfNot} $0 == error
    StrCpy $ModelDirValue $0
    ${NSD_SetText} $ModelDirControl $ModelDirValue
  ${EndIf}
FunctionEnd

Function meristemforgeModelPageLeave
  ${NSD_GetText} $ModelDirControl $ModelDirValue
  ${If} $ModelDirValue == ""
    StrCpy $ModelDirValue "$APPDATA\MeristemForge\models"
  ${EndIf}
  CreateDirectory "$APPDATA\MeristemForge"
  FileOpen $0 "$APPDATA\MeristemForge\model-directory.txt" w
  FileWrite $0 "$ModelDirValue"
  FileWriteByte $0 13
  FileWriteByte $0 10
  FileClose $0
FunctionEnd

Page custom meristemforgeModelPageCreate meristemforgeModelPageLeave

!macro customInstall
  ; Extract the bundled runtime while the assisted installer is still running.
  ExecWait '"$INSTDIR\resources\runtime-extractor\7z.exe" x -y "$INSTDIR\resources\runtime-archive\runtime.7z" "-o$APPDATA\MeristemForge"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "ComfyUI 运行时解压失败，请检查磁盘空间后重试。"
    Abort
  ${EndIf}
  Delete "$INSTDIR\resources\runtime-archive\runtime.7z"
  Delete "$INSTDIR\resources\runtime-extractor\7z.exe"
  Delete "$INSTDIR\resources\runtime-extractor\7z.dll"
  RMDir "$INSTDIR\resources\runtime-archive"
  RMDir "$INSTDIR\resources\runtime-extractor"
!macroend
