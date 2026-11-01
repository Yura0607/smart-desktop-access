import 'package:flutter_hbb/models/platform_model.dart';

/// Mirrors `src/product.rs`. The running app reads the built-in options that
/// `product::apply()` writes; these constants are the fallback.
const kSdaSourceUrl = 'https://github.com/Yura0607/smart-desktop-access';
const kSdaDownloadPageUrl =
    'https://github.com/Yura0607/smart-desktop-access/releases/latest';
const kSdaCompanionUrl = 'https://smartdesktopaccess.duckdns.org/companion';
const kSdaCopyright =
    'Copyright © 2026 Smart Desktop Access. Based on RustDesk, © Purslane Tech Pte. Ltd., AGPL-3.0';

const kSdaWindowsDownloadUrl =
    'https://github.com/Yura0607/smart-desktop-access/releases/latest/download/SmartDesktopAccess-windows-x64.exe';
const kSdaMacArmDownloadUrl =
    'https://github.com/Yura0607/smart-desktop-access/releases/latest/download/SmartDesktopAccess-macos-arm64.dmg';
const kSdaMacIntelDownloadUrl =
    'https://github.com/Yura0607/smart-desktop-access/releases/latest/download/SmartDesktopAccess-macos-x64.dmg';

String _builtin(String key, String fallback) {
  try {
    final value = bind.mainGetBuildinOption(key: key);
    if (value.isNotEmpty) {
      return value;
    }
  } catch (_) {}
  return fallback;
}

String productDisplayName() => _builtin(
      'display-name',
      bind.mainGetAppNameSync() == 'SmartDesktopAccessAdmin'
          ? 'Smart Desktop Access Admin'
          : 'Smart Desktop Access',
    );

String sdaSourceUrl() => _builtin('source-url', kSdaSourceUrl);

String sdaDownloadPageUrl() => _builtin('download-page-url', kSdaDownloadPageUrl);

String sdaCompanionUrl() => _builtin('companion-url', kSdaCompanionUrl);

/// Join [path] onto the companion base, keeping a `/companion` prefix.
String sdaCompanionApi(String path) {
  var base = sdaCompanionUrl();
  while (base.endsWith('/')) {
    base = base.substring(0, base.length - 1);
  }
  if (!path.startsWith('/')) {
    path = '/$path';
  }
  return '$base$path';
}
