import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_hbb/common/sda/product.dart';
import 'package:http/http.dart' as http;

class SdaNotesDialog extends StatefulWidget {
  const SdaNotesDialog({
    Key? key,
    required this.ownerId,
    required this.label,
    required this.token,
  }) : super(key: key);

  final String ownerId;
  final String label;
  final String token;

  @override
  State<SdaNotesDialog> createState() => _SdaNotesDialogState();
}

class _SdaNotesDialogState extends State<SdaNotesDialog> {
  final _credentials = TextEditingController();
  final _entry = TextEditingController();
  List<Map<String, dynamic>> _log = [];
  String _error = '';
  bool _loading = true;
  bool _show = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _credentials.dispose();
    _entry.dispose();
    super.dispose();
  }

  Map<String, String> get _headers => {
        'Authorization': 'Bearer ${widget.token}',
        'Content-Type': 'application/json',
      };

  String _stamp(int seconds) {
    final time = DateTime.fromMillisecondsSinceEpoch(seconds * 1000).toLocal();
    String two(int value) => value.toString().padLeft(2, '0');
    return '${time.year}-${two(time.month)}-${two(time.day)} ${two(time.hour)}:${two(time.minute)}';
  }

  String _fail(int status) {
    if (status == 401) {
      return 'Admin token was rejected.';
    }
    if (status == 429) {
      return 'Too many requests. Try again in a minute.';
    }
    return 'Could not update notes.';
  }

  Future<void> _load() async {
    try {
      final response = await http.get(
        Uri.parse(sdaCompanionApi('/api/v1/devices/${widget.ownerId}/notes')),
        headers: _headers,
      );
      if (!mounted) {
        return;
      }
      if (response.statusCode != 200) {
        setState(() {
          _loading = false;
          _error = _fail(response.statusCode);
        });
        return;
      }
      final body = jsonDecode(response.body);
      final log = <Map<String, dynamic>>[];
      if (body['log'] is List) {
        for (final item in body['log']) {
          if (item is Map) {
            log.add(Map<String, dynamic>.from(item));
          }
        }
      }
      setState(() {
        _credentials.text = '${body['credentials'] ?? ''}';
        _log = log;
        _loading = false;
        _error = '';
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Could not load notes.';
        });
      }
    }
  }

  Future<void> _saveCredentials() async {
    setState(() => _busy = true);
    try {
      final response = await http.put(
        Uri.parse(sdaCompanionApi('/api/v1/devices/${widget.ownerId}/notes')),
        headers: _headers,
        body: jsonEncode({'credentials': _credentials.text}),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _busy = false;
        _error = response.statusCode == 200 ? '' : _fail(response.statusCode);
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Could not update notes.';
        });
      }
    }
  }

  Future<void> _addEntry() async {
    final text = _entry.text.trim();
    if (text.isEmpty) {
      return;
    }
    setState(() => _busy = true);
    try {
      final response = await http.post(
        Uri.parse(sdaCompanionApi('/api/v1/devices/${widget.ownerId}/log')),
        headers: _headers,
        body: jsonEncode({'text': text}),
      );
      if (!mounted) {
        return;
      }
      if (response.statusCode == 200) {
        _entry.clear();
      }
      setState(() {
        _busy = false;
        _error = response.statusCode == 200 ? '' : _fail(response.statusCode);
      });
      if (response.statusCode == 200) {
        await _load();
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Could not update notes.';
        });
      }
    }
  }

  Future<void> _editEntry(Map<String, dynamic> entry) async {
    final controller = TextEditingController(text: '${entry['text'] ?? ''}');
    final text = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit log entry'),
        content: TextField(
          controller: controller,
          autofocus: true,
          minLines: 2,
          maxLines: 6,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (text == null || text.isEmpty || !mounted) {
      return;
    }
    setState(() => _busy = true);
    try {
      final response = await http.put(
        Uri.parse(
          sdaCompanionApi('/api/v1/devices/${widget.ownerId}/log/${entry['id']}'),
        ),
        headers: _headers,
        body: jsonEncode({'text': text}),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _busy = false;
        _error = response.statusCode == 200 ? '' : _fail(response.statusCode);
      });
      if (response.statusCode == 200) {
        await _load();
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Could not update notes.';
        });
      }
    }
  }

  Future<void> _deleteEntry(Map<String, dynamic> entry) async {
    setState(() => _busy = true);
    try {
      final response = await http.delete(
        Uri.parse(
          sdaCompanionApi('/api/v1/devices/${widget.ownerId}/log/${entry['id']}'),
        ),
        headers: _headers,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _busy = false;
        _error = response.statusCode == 200 ? '' : _fail(response.statusCode);
      });
      if (response.statusCode == 200) {
        await _load();
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Could not update notes.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Notes · ${widget.label}'),
      content: SizedBox(
        width: 440,
        child: _loading
            ? const SizedBox(
                height: 80,
                child: Center(child: CircularProgressIndicator()),
              )
            : SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Passwords / credentials'),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _credentials,
                      obscureText: !_show,
                      minLines: _show ? 3 : 1,
                      maxLines: _show ? 8 : 1,
                      decoration: const InputDecoration(
                        hintText: 'Passwords for programs on this computer',
                      ),
                    ),
                    Wrap(
                      spacing: 4,
                      children: [
                        TextButton(
                          onPressed: () => setState(() => _show = !_show),
                          child: Text(_show ? 'Hide' : 'Show'),
                        ),
                        TextButton(
                          onPressed: () {
                            Clipboard.setData(
                              ClipboardData(text: _credentials.text),
                            );
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Copied.')),
                            );
                          },
                          child: const Text('Copy'),
                        ),
                        TextButton(
                          onPressed: _busy ? null : _saveCredentials,
                          child: const Text('Save'),
                        ),
                      ],
                    ),
                    const Divider(),
                    const Text('Work log'),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _entry,
                            minLines: 1,
                            maxLines: 4,
                            decoration: const InputDecoration(
                              hintText: 'What was done',
                            ),
                          ),
                        ),
                        TextButton(
                          onPressed: _busy ? null : _addEntry,
                          child: const Text('Add'),
                        ),
                      ],
                    ),
                    for (final entry in _log)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _stamp(int.tryParse('${entry['created_at']}') ?? 0),
                              style: const TextStyle(fontSize: 12),
                            ),
                            Text('${entry['text'] ?? ''}'),
                            Wrap(
                              spacing: 4,
                              children: [
                                TextButton(
                                  onPressed: _busy ? null : () => _editEntry(entry),
                                  child: const Text('Edit'),
                                ),
                                TextButton(
                                  onPressed:
                                      _busy ? null : () => _deleteEntry(entry),
                                  child: const Text('Delete'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    if (_error.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(_error),
                      ),
                  ],
                ),
              ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
