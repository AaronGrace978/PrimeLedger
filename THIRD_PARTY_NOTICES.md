# Third-party software

PrimeLedger is licensed under GPL-3.0-or-later. Dependency licenses remain with their respective authors. The lockfile records the versions distributed.

## eSpeak NG

Bundled package: `@echogarden/espeak-ng-emscripten` 0.3.5, GPL-3.0. Copyright eSpeak NG and Echogarden contributors. The package includes COPYING.

- Emscripten port source and build instructions: https://github.com/echogarden-project/espeak-ng-emscripten
- Synthesizer fork: https://github.com/echogarden-project/espeak-ng/tree/fork
- Upstream: https://github.com/espeak-ng/espeak-ng

The port is used unmodified from the npm package, with its complete JS engine and voice data bundled by electron-builder. No external speech executable or cloud speech service is needed. PrimeLedger source is included with each GitHub release through the source archives. Users redistributing binary builds must preserve GPL notices and satisfy corresponding-source requirements for bundled GPL components.

Electron embeds Chromium and Node.js; Electron's distribution contains LICENSE and LICENSES.chromium.html. React (MIT), Lucide (ISC), Vite (MIT), Capacitor (MIT), idb (ISC), and electron-updater (MIT) retain their licenses in their packages.
