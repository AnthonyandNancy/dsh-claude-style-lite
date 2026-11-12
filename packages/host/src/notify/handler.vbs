' Turns a dsh-claude-style-lite click into the session the page opens next.
Option Explicit

Dim fso, shell, url, id, directory, file, stream, stamp, sessionKey

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

url = ""
If WScript.Arguments.Count > 0 Then url = WScript.Arguments(0)
id = SessionFromUrl(url)
If Not ValidSessionId(id) Then WScript.Quit 0

directory = shell.ExpandEnvironmentStrings("%DSH_HOME%")
If directory = "%DSH_HOME%" Or directory = "" Then
  directory = shell.ExpandEnvironmentStrings("%USERPROFILE%\.dsh")
End If
directory = directory & "\dsh-claude-style-lite"
If Not fso.FolderExists(directory) Then fso.CreateFolder(directory)

file = directory & "\notify-activation.json"
stamp = DateDiff("s", "1/1/1970", Now()) * 1000
Set stream = fso.CreateTextFile(file, True)
stream.Write "{""sessionId"":""" & JsonString(id) & """,""at"":" & stamp & "}"
stream.Close
shell.Run "dsh://open", 0, False

Function SessionFromUrl(value)
  Dim at, rest
  SessionFromUrl = ""
  sessionKey = "session"
  at = InStr(value, sessionKey & "=")
  If at = 0 Then Exit Function
  rest = Mid(value, at + Len(sessionKey) + 1)
  If InStr(rest, "&") > 0 Then rest = Left(rest, InStr(rest, "&") - 1)
  SessionFromUrl = Decode(rest)
End Function

Function ValidSessionId(value)
  Dim re
  Set re = New RegExp
  re.Pattern = "^[A-Za-z0-9_-]{1,128}$"
  re.IgnoreCase = False
  ValidSessionId = re.Test(value)
End Function

Function Decode(value)
  Dim i, ch, code, out
  out = ""
  i = 1
  Do While i <= Len(value)
    ch = Mid(value, i, 1)
    If ch = "%" And i + 2 <= Len(value) Then
      code = HexValue(Mid(value, i + 1, 2))
      If code >= 0 Then
        out = out & Chr(code)
        i = i + 3
      Else
        out = out & ch
        i = i + 1
      End If
    ElseIf ch = "+" Then
      out = out & " "
      i = i + 1
    Else
      out = out & ch
      i = i + 1
    End If
  Loop
  Decode = out
End Function

Function HexValue(value)
  Dim code
  HexValue = -1
  If Len(value) <> 2 Then Exit Function
  On Error Resume Next
  code = CLng("&H" & value)
  On Error GoTo 0
  HexValue = code
End Function

Function JsonString(value)
  Dim i, ch, out
  out = ""
  For i = 1 To Len(value)
    ch = Mid(value, i, 1)
    If ch = Chr(34) Then
      out = out & Chr(92) & Chr(34)
    ElseIf ch = Chr(92) Then
      out = out & Chr(92) & Chr(92)
    Else
      out = out & ch
    End If
  Next
  JsonString = out
End Function
