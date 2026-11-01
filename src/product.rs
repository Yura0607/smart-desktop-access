//! Smart Desktop Access identity and the built-in ID/relay and API servers.
//!
//! Change the server host, public key, API server, or companion URL here. Both
//! the client and the admin build read this module; `SDA_VARIANT=admin`
//! selects the outgoing-only manager, and any other value (including unset) is
//! the incoming-only client.

use std::sync::atomic::{AtomicBool, Ordering};

/// DNS name of the ID/relay, API, and companion host. Ports 21116 and 21117
/// stay the protocol defaults. Change only this when the name changes.
pub const SERVER_HOST: &str = "smartdesktopaccess.duckdns.org";
/// hbbs public key (`-k` / `id_ed25519.pub`).
pub const SERVER_PUBLIC_KEY: &str = "IZnoUoa33KdpLzeQLzosH7I8oo6vRNVjv8MxezPM5Rc=";
/// Account login. Caddy on 443 proxies this host to rustdesk-api.
/// Written out in full: `concat!` cannot take `SERVER_HOST` on the CI toolchain.
pub const API_SERVER: &str = "https://smartdesktopaccess.duckdns.org";
/// Companion API. Caddy strips the `/companion` prefix and proxies to the
/// companion process.
pub const COMPANION_URL: &str = "https://smartdesktopaccess.duckdns.org/companion";
/// Windows publisher / company and Mac vendor. Not the install folder name.
pub const PUBLISHER: &str = "Yuriy";
pub const LEGAL_COPYRIGHT: &str = "Copyright © 2026 Yuriy. Based on RustDesk, © Purslane Tech Pte. Ltd., AGPL-3.0";
pub const SOURCE_URL: &str = "https://github.com/Yura0607/smart-desktop-access";
pub const DOWNLOAD_PAGE_URL: &str = "https://smartdesktopaccess.duckdns.org/downloads";

/// Install name: executable, service, and bundle folder. No spaces; the
/// Windows installer rejects names that are not safe to drop into a command.
pub const CLIENT_INSTALL_NAME: &str = "SmartDesktopAccess";
pub const ADMIN_INSTALL_NAME: &str = "SmartDesktopAccessAdmin";
pub const CLIENT_DISPLAY_NAME: &str = "Smart Desktop Access";
pub const ADMIN_DISPLAY_NAME: &str = "Smart Desktop Access Admin";

pub fn is_admin() -> bool {
    matches!(option_env!("SDA_VARIANT"), Some("admin"))
}

pub fn install_name() -> &'static str {
    if is_admin() {
        ADMIN_INSTALL_NAME
    } else {
        CLIENT_INSTALL_NAME
    }
}

pub fn display_name() -> &'static str {
    if is_admin() {
        ADMIN_DISPLAY_NAME
    } else {
        CLIENT_DISPLAY_NAME
    }
}

/// `path` is relative to the companion (`api/v1/devices`). The `/companion`
/// prefix on [`COMPANION_URL`] is kept so Caddy can strip it.
pub fn companion_api(path: &str) -> String {
    format!(
        "{}/{}",
        COMPANION_URL.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

pub fn bundle_id() -> &'static str {
    if is_admin() {
        "com.smartdesktopaccess.admin"
    } else {
        "com.smartdesktopaccess.client"
    }
}

/// Apply the product identity before configuration is loaded.
pub fn apply() {
    static APPLIED: AtomicBool = AtomicBool::new(false);
    if APPLIED.swap(true, Ordering::SeqCst) {
        return;
    }
    *hbb_common::config::APP_NAME.write().unwrap() = install_name().to_owned();
    #[cfg(target_os = "macos")]
    {
        *hbb_common::config::ORG.write().unwrap() = "com.smartdesktopaccess".to_owned();
    }
    *hbb_common::config::PROD_RENDEZVOUS_SERVER.write().unwrap() = SERVER_HOST.to_owned();

    hbb_common::config::HARD_SETTINGS
        .write()
        .unwrap()
        .insert(
            "conn-type".to_owned(),
            if is_admin() { "outgoing" } else { "incoming" }.to_owned(),
        );

    let mut overwrite = hbb_common::config::OVERWRITE_SETTINGS.write().unwrap();
    overwrite.insert("custom-rendezvous-server".to_owned(), SERVER_HOST.to_owned());
    overwrite.insert("key".to_owned(), SERVER_PUBLIC_KEY.to_owned());
    overwrite.insert("api-server".to_owned(), API_SERVER.to_owned());
    if is_admin() {
        // Same-LAN NAT hairpin accepts a direct socket and then never finishes
        // the handshake. The manager always asks the relay.
        overwrite.insert("force-always-relay".to_owned(), "Y".to_owned());
    }
    if !is_admin() {
        // Click Accept on the consent panel, unless the manager presents the
        // permanent password stored by the companion.
        overwrite.insert("approve-mode".to_owned(), "password-click".to_owned());
        overwrite.insert(
            "verification-method".to_owned(),
            "use-permanent-password".to_owned(),
        );
        overwrite.insert("enable-lan-discovery".to_owned(), "N".to_owned());
        overwrite.insert("direct-server".to_owned(), "N".to_owned());
        overwrite.insert("allow-insecure-tls-fallback".to_owned(), "N".to_owned());
        // The manager sends and receives files. Do not leave this at No.
        overwrite.insert("enable-file-transfer".to_owned(), "Y".to_owned());
        // Voice call uses the audio permission. The consent panel already
        // shows Accept when a call comes in. Camera is the upstream view-camera
        // session, not a separate video call.
        overwrite.insert("enable-audio".to_owned(), "Y".to_owned());
        overwrite.insert("enable-camera".to_owned(), "Y".to_owned());
    }
    drop(overwrite);

    let mut builtin = hbb_common::config::BUILTIN_SETTINGS.write().unwrap();
    builtin.insert("hide-powered-by-me".to_owned(), "Y".to_owned());
    builtin.insert("hide-server-settings".to_owned(), "Y".to_owned());
    if !is_admin() {
        builtin.insert("hide-security-settings".to_owned(), "Y".to_owned());
    }
    builtin.insert("companion-url".to_owned(), COMPANION_URL.to_owned());
    builtin.insert("download-page-url".to_owned(), DOWNLOAD_PAGE_URL.to_owned());
    builtin.insert("source-url".to_owned(), SOURCE_URL.to_owned());
    builtin.insert("display-name".to_owned(), display_name().to_owned());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_constants_match_the_requirements() {
        assert_eq!(SERVER_HOST, "smartdesktopaccess.duckdns.org");
        assert_eq!(
            SERVER_PUBLIC_KEY,
            "IZnoUoa33KdpLzeQLzosH7I8oo6vRNVjv8MxezPM5Rc="
        );
        assert_eq!(PUBLISHER, "Yuriy");
        assert_eq!(CLIENT_DISPLAY_NAME, "Smart Desktop Access");
        assert_eq!(ADMIN_DISPLAY_NAME, "Smart Desktop Access Admin");
        assert!(!CLIENT_INSTALL_NAME.contains(' '));
        assert!(!ADMIN_INSTALL_NAME.contains(' '));
        assert!(SOURCE_URL.contains("Yura0607/smart-desktop-access"));
        assert!(API_SERVER.starts_with("https://"));
        assert!(!API_SERVER.contains(":21114"));
        assert!(!COMPANION_URL.contains(":21120"));
        assert_eq!(API_SERVER, "https://smartdesktopaccess.duckdns.org");
        assert_eq!(
            COMPANION_URL,
            "https://smartdesktopaccess.duckdns.org/companion"
        );
        assert_eq!(
            companion_api("api/v1/devices"),
            "https://smartdesktopaccess.duckdns.org/companion/api/v1/devices"
        );
        assert!(!API_SERVER.contains("129.213.112.22"));
        assert!(!COMPANION_URL.contains("129.213.112.22"));
        assert!(install_name() == CLIENT_INSTALL_NAME || install_name() == ADMIN_INSTALL_NAME);
        assert_ne!(display_name(), "RustDesk");
    }
}
