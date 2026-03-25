> **SUPERSEDED** — Absorbed into `ecl-platform-restructuring` (Phase 4: IntelliJ client bundling). Archived 2026-02-28.

## Why

The IntelliJ plugin currently requires users to globally install `ecl-lsp-server` via `npm link` or `npm install -g`. This is a poor UX — users must have Node.js configured and manually install the server before the plugin works. Bundling the server inside the plugin makes it self-contained and zero-config.

## What Changes

- **Bundle server in plugin**: `build.gradle.kts` adds Gradle tasks (`bundleServer`, `installServerDeps`) that copy `server/dist/` and install production `node_modules` into the plugin ZIP via `prepareSandbox`
- **Bundled server path resolution**: `EclLspServerDescriptor` looks for bundled `ecl-server/dist/server.js` inside the plugin directory first, falls back to global `ecl-lsp-server` on PATH
- **TextMate grammar from plugin path**: `EclTextMateBundleProvider` resolves grammar from the plugin's filesystem path (via `PluginManagerCore`) instead of classpath `javaClass.getResource()` — fixes issues with TextMate bundle loading in production builds
- **Direct FHIR for edition picker**: `SnomedEditionPicker` fetches SNOMED editions directly via `java.net.http.HttpClient` instead of going through the LSP server's custom request — eliminates fragile reflective access to `lsp4jServer`
- **Remove custom file type**: Delete `EclFileType.kt`, `EclIcons.kt`, and `ecl.svg` — TextMate handles `.ecl` file association, the custom `LanguageFileType` was conflicting
- **Plugin descriptor cleanup**: `plugin.xml` removes `<fileType>` registration, changes dependency from `com.intellij.modules.lsp` to `com.intellij.modules.ultimate`
- **Version compatibility**: `gradle.properties` changes `pluginUntilBuild` from `262.*` to `253.*`
- **Test infrastructure**: `build.gradle.kts` adds test framework dependencies
- **Server restart on edition change**: `SnomedEditionPicker` calls `LspServerManager.stopAndRestartIfNeeded()` after changing the SNOMED edition setting
- **README updated**: Reflects that server is bundled, no separate install needed

## Capabilities

### New Capabilities

- `intellij-bundled-server`: Self-contained IntelliJ plugin with bundled ECL language server (no separate npm install required)

### Modified Capabilities

_(none — these are implementation-level changes to the existing IntelliJ plugin)_

## Impact

- **Files**: `clients/intellij/build.gradle.kts`, `EclLspServerDescriptor.kt`, `EclTextMateBundleProvider.kt`, `SnomedEditionPicker.kt`, `plugin.xml`, `gradle.properties`, `README.md`
- **Deleted files**: `EclFileType.kt`, `EclIcons.kt`, `icons/ecl.svg`
- **New files**: `src/main/resources/textmate/ecl/package.json`, `src/test/` directory
- **Dependencies**: Adds `com.google.gson.Gson` usage in `SnomedEditionPicker`, test framework deps
- **Build**: Plugin ZIP now includes `ecl-server/` directory with Node.js server + dependencies

## Reference

The full diff is saved in `reference/changes.diff`. Untracked files saved in `reference/`.
