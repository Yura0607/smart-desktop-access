set sh1 to "launchctl unload -w /Library/LaunchDaemons/com.carriez.RustDesk_service.plist;"
set sh2 to "/bin/rm /Library/LaunchDaemons/com.carriez.RustDesk_service.plist;"
set sh3 to "/bin/rm /Library/LaunchAgents/com.carriez.RustDesk_server.plist;"

-- Also remove plists left by builds before the launchd-name fix. The name is
-- split so correct_app_name() keeps the legacy prefix.
set legacy_prefix to "com." & "carriez." & "RustDesk"
set legacy_daemon to "/Library/LaunchDaemons/" & legacy_prefix & "_service.plist"
set legacy_agent to "/Library/LaunchAgents/" & legacy_prefix & "_server.plist"
set sh4 to "if [ " & quoted form of legacy_daemon & " != /Library/LaunchDaemons/com.carriez.RustDesk_service.plist ]; then launchctl unload -w " & quoted form of legacy_daemon & " 2>/dev/null; /bin/rm -f " & quoted form of legacy_daemon & " " & quoted form of legacy_agent & "; fi;"

set sh to sh1 & sh2 & sh3 & sh4
do shell script sh with prompt "RustDesk wants to unload daemon" with administrator privileges