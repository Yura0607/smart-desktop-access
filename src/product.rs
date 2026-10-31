//! Smart Desktop Access identity and the built-in ID/relay server.
//!
//! Change the server host, public key, or companion URL here. Both the client
//! and the admin build read this module; `SDA_VARIANT=admin` selects the
//! outgoing-only manager, and any other value (including unset) is the
//! incoming-only client.

use std::sync::atomic::{AtomicBool, Ordering};

/// ID/relay host. hbbs/hbbr on the Oracle VM.
pub const SERVER_HOST: &str = "129.213.112.22";
/// hbbs public key (`-k` / `id_ed25519.pub`).
pub const SERVER_PUBLIC_KEY: &str = "IZnoUoa33KdpLzeQLzosH7I8oo6vRNVjv8MxezPM5Rc=";
/// Companion API (client list and email). Same VM, TCP 21120.
pub const COMPANION_URL: &str = "http://129.213.112.22:21120";
pub const SOURCE_URL: &str = "https://github.com/Yura0607/smart-desktop-access";
pub const DOWNLOAD_PAGE_URL: &str =
    "https://github.com/Yura0607/smart-desktop-access/releases/latest";

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
    if !is_admin() {
        // Unattended: accept the permanent password and do not ask anyone to click.
        overwrite.insert("approve-mode".to_owned(), "password".to_owned());
        overwrite.insert(
            "verification-method".to_owned(),
            "use-permanent-password".to_owned(),
        );
    }
    drop(overwrite);

    let mut builtin = hbb_common::config::BUILTIN_SETTINGS.write().unwrap();
    builtin.insert("hide-powered-by-me".to_owned(), "Y".to_owned());
    builtin.insert("hide-server-settings".to_owned(), "Y".to_owned());
    if !is_admin() {
        builtin.insert("hide-security-settings".to_owned(), "Y".to_owned());
    }
    // Do not call the public RustDesk API or port 21114 on the ID server.
    builtin.insert("register-device".to_owned(), "N".to_owned());
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
        assert_eq!(SERVER_HOST, "129.213.112.22");
        assert_eq!(
            SERVER_PUBLIC_KEY,
            "IZnoUoa33KdpLzeQLzosH7I8oo6vRNVjv8MxezPM5Rc="
        );
        assert_eq!(CLIENT_DISPLAY_NAME, "Smart Desktop Access");
        assert_eq!(ADMIN_DISPLAY_NAME, "Smart Desktop Access Admin");
        assert!(!CLIENT_INSTALL_NAME.contains(' '));
        assert!(!ADMIN_INSTALL_NAME.contains(' '));
        assert!(SOURCE_URL.contains("Yura0607/smart-desktop-access"));
        assert!(install_name() == CLIENT_INSTALL_NAME || install_name() == ADMIN_INSTALL_NAME);
        assert_ne!(display_name(), "RustDesk");
    }
}
