import 'product.dart';

/// English note sent to a customer. The companion service sends the same
/// text when SMTP is configured (`server/companion/email_text.py`). Keep the
/// two copies together when the wording changes.
String installEmailSubject() => 'Your Smart Desktop Access program';

String installEmailBody() {
  return '''
Hello,

This is the program that lets your helper work on your computer with you.

Please install it once. After that you do not need to do anything else. Your computer can be reached when it is turned on and connected to the internet.

Windows
1. Download the Windows installer: $kSdaWindowsDownloadUrl
2. Open the downloaded file.
3. If Windows asks whether to allow changes, click Yes.
4. Click Install and wait until it finishes.
5. If a box asks for your email address, type the address this message was sent to, then click Save.
6. You can close the window. A small icon stays near the clock. That means the program is ready.

Mac (most Macs from 2020 onward, Apple silicon)
1. Download the Mac installer: $kSdaMacArmDownloadUrl
2. Open the downloaded file and drag Smart Desktop Access into Applications.
3. Open Applications and double-click Smart Desktop Access.
4. If the Mac says the app cannot be opened: click Done, then open System Settings, go to Privacy & Security, and click Open Anyway.
5. When the Mac asks for Screen Recording, Accessibility, and Input Monitoring, turn each one on. The program needs these so your helper can see the screen and use the mouse and keyboard.
6. If a box asks for your email address, type the address this message was sent to, then click Save.
7. If it offers to install a background helper, click Install. That starts the program when you log in.

Older Intel Mac
Download this installer instead: $kSdaMacIntelDownloadUrl
Then follow the same Mac steps above.

You only do this once. If something does not work, reply to this email.

All downloads are also listed here: $kSdaDownloadPageUrl
''';
}

String installMailto(String email) {
  final subject = Uri.encodeComponent(installEmailSubject());
  final body = Uri.encodeComponent(installEmailBody());
  return 'mailto:$email?subject=$subject&body=$body';
}
