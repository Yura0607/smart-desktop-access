import 'dart:async';
import 'dart:convert';

import 'package:desktop_multi_window/desktop_multi_window.dart';
import 'package:flutter/material.dart';
import 'package:flutter_hbb/common.dart';
import 'package:flutter_hbb/common/sda/email_text.dart';
import 'package:flutter_hbb/common/sda/product.dart';
import 'package:flutter_hbb/models/platform_model.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

const _tokenKey = 'sda-admin-token';
const _knownKey = 'sda-known-ids';

class SdaClient {
  SdaClient(this.json);

  final Map<String, dynamic> json;

  String get id => '${json['id'] ?? ''}';
  String get hostname => '${json['hostname'] ?? ''}'.trim();
  String get email => '${json['email'] ?? ''}'.trim();
  String get password => '${json['password'] ?? ''}';
  String get platform => '${json['platform'] ?? ''}';
  bool get online => json['online'] == true;
  String get label => hostname.isEmpty ? id : hostname;
}

class SdaClientsPage extends StatefulWidget {
  const SdaClientsPage({Key? key}) : super(key: key);

  @override
  State<SdaClientsPage> createState() => _SdaClientsPageState();
}

class _SdaClientsPageState extends State<SdaClientsPage> {
  Timer? _timer;
  List<SdaClient> _clients = [];
  String _error = '';
  bool _loading = true;
  final _tokenController = TextEditingController();
  bool _showToken = false;

  @override
  void initState() {
    super.initState();
    _tokenController.text = bind.mainGetLocalOption(key: _tokenKey);
    _showToken = _tokenController.text.isEmpty;
    _refresh();
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => _refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _tokenController.dispose();
    super.dispose();
  }

  Set<String> get _known {
    return bind
        .mainGetLocalOption(key: _knownKey)
        .split(',')
        .where((id) => id.isNotEmpty)
        .toSet();
  }

  List<SdaClient> get _fresh =>
      _clients.where((client) => !_known.contains(client.id)).toList();

  Future<void> _refresh() async {
    final token = bind.mainGetLocalOption(key: _tokenKey);
    if (token.isEmpty) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = '';
          _showToken = true;
        });
      }
      return;
    }
    try {
      final response = await http.get(
        Uri.parse(sdaCompanionApi('/api/v1/devices')),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (response.statusCode == 401) {
        if (mounted) {
          setState(() {
            _loading = false;
            _error = 'The companion token was not accepted.';
            _showToken = true;
          });
        }
        return;
      }
      if (response.statusCode != 200) {
        throw Exception('HTTP ${response.statusCode}');
      }
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final list = (body['devices'] as List? ?? [])
          .map((item) => SdaClient(Map<String, dynamic>.from(item as Map)))
          .toList();
      if (mounted) {
        setState(() {
          _clients = list;
          _loading = false;
          _error = '';
        });
      }
    } catch (err) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Could not reach the companion service.';
        });
      }
    }
  }

  Future<void> _saveToken() async {
    final token = _tokenController.text.trim();
    await bind.mainSetLocalOption(key: _tokenKey, value: token);
    if (mounted) {
      setState(() => _showToken = token.isEmpty);
    }
    await _refresh();
  }

  Future<void> _markSeen() async {
    final ids = _clients.map((client) => client.id).join(',');
    await bind.mainSetLocalOption(key: _knownKey, value: ids);
    if (mounted) {
      setState(() {});
    }
  }

  Future<void> _connect(SdaClient client) async {
    await connect(context, client.id, password: client.password);
  }

  Future<void> _disconnect(SdaClient client) async {
    var closed = false;
    if (isDesktop) {
      try {
        final windows = await DesktopMultiWindow.getAllSubWindowIds();
        for (final windowId in windows) {
          try {
            final result = await DesktopMultiWindow.invokeMethod(
                windowId, 'sda_close_session', client.id);
            if (result == true) {
              closed = true;
            }
          } catch (_) {}
        }
      } catch (_) {}
    } else if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
      closed = true;
    }
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(closed
          ? 'Disconnected from ${client.label}.'
          : 'No open session to ${client.label}.'),
    ));
  }

  Future<void> _sendEmail(SdaClient client) async {
    if (client.email.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('This computer has no email address yet.'),
      ));
      return;
    }
    final token = bind.mainGetLocalOption(key: _tokenKey);
    try {
      final response = await http.post(
        Uri.parse(sdaCompanionApi('/api/v1/devices/${client.id}/email')),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: '{}',
      );
      if (response.statusCode == 200) {
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        if (body['sent'] == true) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text('Email sent to ${client.email}.'),
            ));
          }
          return;
        }
        final mailto = '${body['mailto'] ?? ''}';
        if (mailto.isNotEmpty && await launchUrl(Uri.parse(mailto))) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text(
                  'The server did not send the email. Your email program was opened instead.'),
            ));
          }
          return;
        }
      }
    } catch (_) {}
    final mailto = installMailto(client.email);
    final opened = await launchUrl(Uri.parse(mailto));
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Could not open the email program.'),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final fresh = _fresh;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_showToken) _tokenCard(),
        if (fresh.isNotEmpty)
          MaterialBanner(
            content: Text(fresh.length == 1
                ? 'New computer: ${fresh.first.label}'
                : '${fresh.length} new computers'),
            leading: const Icon(Icons.notifications_active),
            actions: [
              TextButton(onPressed: _markSeen, child: const Text('Got it')),
            ],
          ),
        if (_error.isNotEmpty)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(_error),
          ),
        Expanded(
          child: _loading && _clients.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : ListView.separated(
                  itemCount: _clients.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final client = _clients[index];
                    final isNew = !_known.contains(client.id);
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ListTile(
                          title: Text(client.label),
                          subtitle: Text(
                            [
                              if (client.email.isNotEmpty) client.email,
                              'ID ${client.id}',
                              client.online ? 'Online' : 'Offline',
                            ].join(' · '),
                          ),
                          leading: Icon(
                            Icons.circle,
                            size: 14,
                            color: client.online
                                ? const Color(0xFF1FA971)
                                : Colors.grey,
                          ),
                          trailing: isNew
                              ? const Chip(
                                  label: Text('New'),
                                  visualDensity: VisualDensity.compact,
                                )
                              : null,
                        ),
                        Padding(
                          padding: const EdgeInsets.only(left: 8, bottom: 8),
                          child: Wrap(
                            spacing: 4,
                            children: [
                              TextButton(
                                onPressed: () => _connect(client),
                                child: const Text('Connect'),
                              ),
                              TextButton(
                                onPressed: () => _disconnect(client),
                                child: const Text('Disconnect'),
                              ),
                              TextButton(
                                onPressed: () => _sendEmail(client),
                                child: const Text('Send email'),
                              ),
                            ],
                          ),
                        ),
                      ],
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _tokenCard() {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Companion token',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          const Text(
            'Paste the token printed when the companion service starts. It stays on this computer.',
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _tokenController,
            obscureText: true,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              isDense: true,
            ),
          ),
          const SizedBox(height: 8),
          ElevatedButton(onPressed: _saveToken, child: const Text('Save token')),
        ],
      ),
    );
  }
}

class SdaEmailCard extends StatefulWidget {
  const SdaEmailCard({Key? key}) : super(key: key);

  @override
  State<SdaEmailCard> createState() => _SdaEmailCardState();
}

class _SdaEmailCardState extends State<SdaEmailCard> {
  final _controller = TextEditingController();
  static const _key = 'sda-email';

  @override
  void initState() {
    super.initState();
    _controller.text = bind.mainGetOptionSync(key: _key);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final email = _controller.text.trim();
    await bind.mainSetOption(key: _key, value: email);
    if (mounted) {
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!bind.isIncomingOnly()) {
      return const SizedBox.shrink();
    }
    final saved = bind.mainGetOptionSync(key: _key).trim();
    if (saved.isNotEmpty && _controller.text.trim() == saved) {
      return const SizedBox.shrink();
    }
    final light = Theme.of(context).brightness == Brightness.light;
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: light ? const Color(0xFFF3F0FF) : const Color(0xFF2A2448),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Your email address',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          const Text(
            'Type the email address this computer should be listed under, then click Save.',
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _controller,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              isDense: true,
              border: OutlineInputBorder(),
              hintText: 'name@example.com',
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: ElevatedButton(onPressed: _save, child: const Text('Save')),
          ),
        ],
      ),
    );
  }
}
