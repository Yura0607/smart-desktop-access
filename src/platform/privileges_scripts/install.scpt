on run {daemon_file, agent_file, user}

  set prefs_dir to "/Users/" & user & "/Library/Preferences/com.carriez.RustDesk/"
  set prefs_toml to quoted form of (prefs_dir & "RustDesk.toml")
  set prefs2_toml to quoted form of (prefs_dir & "RustDesk2.toml")

  set sh1 to "echo " & quoted form of daemon_file & " > /Library/LaunchDaemons/com.carriez.RustDesk_service.plist && chown root:wheel /Library/LaunchDaemons/com.carriez.RustDesk_service.plist;"

  set sh2 to "echo " & quoted form of agent_file & " > /Library/LaunchAgents/com.carriez.RustDesk_server.plist && chown root:wheel /Library/LaunchAgents/com.carriez.RustDesk_server.plist;"

  set root_prefs_dir to quoted form of "/var/root/Library/Preferences/com.carriez.RustDesk/"

  set sh3 to "mkdir -p " & root_prefs_dir & "; cp -rf " & prefs_toml & " " & root_prefs_dir & ";"

  set sh4 to "cp -rf " & prefs2_toml & " " & root_prefs_dir & ";"

  -- Builds before the launchd-name fix wrote com.carriez.<app>_*.plist. The
  -- name is split so correct_app_name() keeps the legacy prefix. Unload and
  -- remove those so only one login service runs.
  set legacy_prefix to "com." & "carriez." & "RustDesk"
  set legacy_daemon to quoted form of ("/Library/LaunchDaemons/" & legacy_prefix & "_service.plist")
  set legacy_agent to quoted form of ("/Library/LaunchAgents/" & legacy_prefix & "_server.plist")
  set new_daemon to quoted form of "/Library/LaunchDaemons/com.carriez.RustDesk_service.plist"
  set sh0 to "if [ " & legacy_daemon & " != " & new_daemon & " ]; then if [ -f " & legacy_daemon & " ]; then launchctl bootout system " & legacy_daemon & " 2>/dev/null || launchctl unload -w " & legacy_daemon & " 2>/dev/null || true; rm -f " & legacy_daemon & "; fi; if [ -f " & legacy_agent & " ]; then legacy_uid=$(id -u " & quoted form of user & " 2>/dev/null || true); if [ -n \"$legacy_uid\" ]; then launchctl bootout gui/$legacy_uid " & legacy_agent & " 2>/dev/null || true; fi; rm -f " & legacy_agent & "; fi; fi;"

  set sh5 to "launchctl bootout system/com.carriez.RustDesk_service 2>/dev/null || launchctl unload -w /Library/LaunchDaemons/com.carriez.RustDesk_service.plist 2>/dev/null || true; launchctl bootstrap system /Library/LaunchDaemons/com.carriez.RustDesk_service.plist 2>/dev/null || launchctl load -w /Library/LaunchDaemons/com.carriez.RustDesk_service.plist;"

  set sh to sh0 & sh1 & sh2 & sh3 & sh4 & sh5

  do shell script sh with prompt "RustDesk wants to install daemon and agent" with administrator privileges
end run
