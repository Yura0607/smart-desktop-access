import 'local_hostname_stub.dart'
    if (dart.library.io) 'local_hostname_io.dart' as impl;

String localHostname() => impl.localHostname();
