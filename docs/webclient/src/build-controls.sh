#!/bin/sh
# Builds ../sda-controls.js = TweetNaCl-js (public domain, npm "tweetnacl", nacl.min.js) + sda-controls.main.js
# usage: NACL=path/to/node_modules/tweetnacl/nacl.min.js sh build-controls.sh
set -e
cd "$(dirname "$0")"
{ echo '/* Smart Desktop Access web client: remote controls menu. */'; echo '(function () {'; echo '  "use strict";'; echo '  var nacl = (function () { var module = { exports: {} }; var self = window;'; cat "$NACL"; echo; echo '  return module.exports; })();'; echo '  /* secretbox above: TweetNaCl-js, public domain (Unlicense). */'; cat sda-controls.main.js; echo '})();'; } > ../sda-controls.js
node --check ../sda-controls.js
