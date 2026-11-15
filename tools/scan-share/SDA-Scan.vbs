Option Explicit
' Launcher for a desktop shortcut. Starts the scan window with no console.
Dim fso, sh, dir, ps1, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = fso.BuildPath(dir, "SDA-Scan.ps1")
If Not fso.FileExists(ps1) Then
    sh.Popup "SDA-Scan.ps1 was not found in:" & vbCrLf & dir, 8, "Scan from Brother (DR2)", 16
    WScript.Quit 1
End If
cmd = "powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
sh.Run cmd, 0, False
