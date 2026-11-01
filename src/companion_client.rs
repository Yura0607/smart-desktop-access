//! Registers this computer with the companion service so the admin app can list it.
//!
//! Incoming clients only. The permanent password is generated here and stored
//! next to the config so a restart does not invent a new one. It is sent to
//! the companion; it is not written to the log.

use hbb_common::{config::Config, log, tokio};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    time::{Duration, Instant},
};

const PASSWORD_FILE: &str = "sda-access-password";
const TOKEN_FILE: &str = "sda-device-token";
const EMAIL_OPTION: &str = "sda-email";
const NAME_OPTION: &str = "sda-client-name";

pub fn start() {
    if crate::product::is_admin() || hbb_common::config::is_outgoing_only() {
        return;
    }
    tokio::spawn(async move {
        let mut failure_log = Instant::now()
            .checked_sub(Duration::from_secs(600))
            .unwrap_or_else(Instant::now);
        loop {
            if let Err(err) = register_once().await {
                if err == "uninstalling" {
                    break;
                }
                if err != "ID is not ready" && failure_log.elapsed() >= Duration::from_secs(600) {
                    log::warn!("Companion registration failed: {err}");
                    failure_log = Instant::now();
                }
            }
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });
}

async fn register_once() -> Result<(), String> {
    let id = Config::get_id();
    if id.is_empty() {
        return Err("ID is not ready".to_owned());
    }
    let password = ensure_password()?;
    let email = Config::get_option(EMAIL_OPTION);
    let token = read_state(TOKEN_FILE).unwrap_or_default();
    let body = serde_json::json!({
        "id": id,
        "hostname": machine_name(),
        "client_name": client_name(),
        "email": email,
        "password": password,
        "platform": std::env::consts::OS,
        "version": crate::VERSION,
        "device_token": token,
    });
    let url = crate::product::companion_api("api/v1/devices");
    let client = reqwest::Client::builder()
        .https_only(true)
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| err.to_string())?;
    let response = client
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(token) = value.get("device_token").and_then(|v| v.as_str()) {
            if !token.is_empty() {
                let _ = write_state(TOKEN_FILE, token);
            }
        }
        if value.get("deactivated").and_then(|v| v.as_bool()) == Some(true) {
            let token = read_state(TOKEN_FILE).unwrap_or_default();
            acknowledge_deactivated(&client, &id, &token).await?;
            schedule_self_uninstall();
            return Err("uninstalling".to_owned());
        }
    }
    Ok(())
}

async fn acknowledge_deactivated(
    client: &reqwest::Client,
    id: &str,
    token: &str,
) -> Result<(), String> {
    if token.is_empty() {
        return Err("device token missing".to_owned());
    }
    let url = crate::product::companion_api(&format!("api/v1/devices/{id}/deactivated-ack"));
    let response = client
        .post(url)
        .json(&serde_json::json!({ "device_token": token }))
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    Ok(())
}

fn schedule_self_uninstall() {
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_secs(2));
        #[cfg(windows)]
        {
            if let Err(err) = crate::platform::windows::silent_self_uninstall() {
                log::warn!("Silent uninstall failed: {err}");
            }
        }
        #[cfg(target_os = "macos")]
        crate::platform::macos::silent_self_uninstall();
    });
}

fn ensure_password() -> Result<String, String> {
    if let Some(existing) = read_state(PASSWORD_FILE) {
        if !existing.is_empty() {
            return Ok(existing);
        }
    }
    let password = uuid::Uuid::new_v4().simple().to_string();
    if !Config::set_permanent_password(&password) {
        return Err("could not store the permanent password".to_owned());
    }
    write_state(PASSWORD_FILE, &password)?;
    Ok(password)
}

fn state_path(name: &str) -> Result<PathBuf, String> {
    let path = Config::path(name);
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "config directory is not available".to_owned())?;
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    Ok(path)
}

fn read_state(name: &str) -> Option<String> {
    let path = state_path(name).ok()?;
    let text = fs::read_to_string(path).ok()?;
    let text = text.trim().to_owned();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn write_state(name: &str, value: &str) -> Result<(), String> {
    let path = state_path(name)?;
    let mut file = fs::File::create(&path).map_err(|err| err.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = file.set_permissions(fs::Permissions::from_mode(0o600));
    }
    file.write_all(value.as_bytes())
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn client_name() -> String {
    let custom = Config::get_option(NAME_OPTION);
    let custom = custom.trim();
    if !custom.is_empty() {
        return sanitize_name(custom);
    }
    sanitize_name(&machine_name())
}

fn sanitize_name(value: &str) -> String {
    value
        .chars()
        .filter(|ch| *ch != '\n' && *ch != '\r' && *ch != '\0')
        .take(80)
        .collect()
}

fn machine_name() -> String {
    #[cfg(target_os = "windows")]
    {
        if let Ok(name) = std::env::var("COMPUTERNAME") {
            if !name.trim().is_empty() {
                return name;
            }
        }
    }
    if let Ok(name) = fs::read_to_string("/etc/hostname") {
        let name = name.trim();
        if !name.is_empty() {
            return name.to_owned();
        }
    }
    if let Ok(name) = std::env::var("HOSTNAME") {
        if !name.trim().is_empty() {
            return name;
        }
    }
    std::env::consts::OS.to_owned()
}
