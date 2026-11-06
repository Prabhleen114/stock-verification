Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = fso.BuildPath(currentDir, "run_sync.bat")
WshShell.Run chr(34) & batPath & Chr(34), 0
Set WshShell = Nothing
Set fso = Nothing
