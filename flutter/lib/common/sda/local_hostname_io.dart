import 'dart:io';

String localHostname() {
  try {
    return Platform.localHostname.trim();
  } catch (_) {
    return '';
  }
}
