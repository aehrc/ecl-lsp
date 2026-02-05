// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.eclipse;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.core.runtime.FileLocator;
import org.eclipse.core.runtime.ILog;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Platform;
import org.eclipse.core.runtime.Status;
import org.eclipse.jface.preference.IPreferenceStore;
import org.eclipse.lsp4e.server.ProcessStreamConnectionProvider;

/**
 * Provides the connection to the ECL Language Server process.
 *
 * <p>Launch strategy:
 * <ol>
 *   <li>Look for a bundled server inside the plugin at {@code server/bin/ecl-lsp-server.js}</li>
 *   <li>Fall back to a system-wide {@code ecl-lsp-server} command on PATH</li>
 * </ol>
 */
public class EclStreamConnectionProvider extends ProcessStreamConnectionProvider {

    private static final ILog LOG = Platform.getLog(EclStreamConnectionProvider.class);
    private static final String STDIO_FLAG = "--stdio";

    /**
     * Common Node.js install locations to search when 'node' isn't on PATH.
     * On macOS, GUI apps launched from Finder/Dock get a minimal PATH
     * ({@code /usr/bin:/bin:/usr/sbin:/sbin}) that excludes Homebrew, nvm, etc.
     */
    private static final String[] NODE_SEARCH_PATHS = {
        "/opt/homebrew/bin/node",           // macOS Homebrew (Apple Silicon)
        "/usr/local/bin/node",              // macOS Homebrew (Intel) / manual install
        "/usr/bin/node",                    // Linux package manager
        System.getProperty("user.home") + "/.nvm/current/bin/node", // nvm symlink
    };

    public EclStreamConnectionProvider() {
        try {
            String nodePath = null;
            EclPlugin plugin = EclPlugin.getDefault();
            if (plugin != null) {
                IPreferenceStore store = plugin.getPreferenceStore();
                nodePath = store.getString(EclPreferencePage.PREF_NODE_PATH);
            } else {
                logWarn("EclPlugin.getDefault() returned null — plugin not yet activated?");
            }
            if (nodePath == null || nodePath.isEmpty()) {
                nodePath = findNodeExecutable();
            }

            List<String> commands = new ArrayList<>();
            String bundledServer = findBundledServer();

            if (bundledServer != null) {
                commands.add(nodePath);
                commands.add(bundledServer);
                commands.add(STDIO_FLAG);
                logWarn("ECL LSP: using bundled server at " + bundledServer + " with node=" + nodePath);
            } else {
                commands.add("ecl-lsp-server");
                commands.add(STDIO_FLAG);
                logWarn("ECL LSP: using system ecl-lsp-server (bundled server not found)");
            }

            logWarn("ECL LSP: commands = " + commands);
            setCommands(commands);
            setWorkingDirectory(System.getProperty("user.dir"));
        } catch (Exception e) {
            logError("ECL LSP: constructor failed", e);
            // Set a minimal fallback command so LSP4E doesn't get a null
            List<String> fallback = new ArrayList<>();
            fallback.add("ecl-lsp-server");
            fallback.add(STDIO_FLAG);
            setCommands(fallback);
        }
    }

    @Override
    public void start() throws IOException {
        logWarn("ECL LSP: starting server process, commands=" + getCommands()
                + ", workingDir=" + getWorkingDirectory());
        try {
            super.start();
            logWarn("ECL LSP: server process started successfully");
        } catch (IOException e) {
            logError("ECL LSP: server process failed to start", e);
            throw e;
        }
    }

    /**
     * Provide initialization options sent in {@code InitializeParams.initializationOptions}.
     */
    @Override
    public Object getInitializationOptions(URI rootUri) {
        Map<String, Object> options = new HashMap<>();
        EclPlugin plugin = EclPlugin.getDefault();
        if (plugin == null) {
            return options;
        }
        IPreferenceStore store = plugin.getPreferenceStore();

        String fhirUrl = store.getString(EclPreferencePage.PREF_FHIR_URL);
        if (fhirUrl != null && !fhirUrl.isEmpty()) {
            options.put("fhirTerminologyServerUrl", fhirUrl);
        }

        int timeout = store.getInt(EclPreferencePage.PREF_TIMEOUT);
        if (timeout > 0) {
            options.put("timeout", timeout);
        }

        String snomedVersion = store.getString(EclPreferencePage.PREF_SNOMED_VERSION);
        if (snomedVersion != null && !snomedVersion.isEmpty()) {
            options.put("snomedVersion", snomedVersion);
        }

        boolean semanticValidation = store.getBoolean(EclPreferencePage.PREF_SEMANTIC_VALIDATION);
        options.put("semanticValidation", semanticValidation);

        int resultLimit = store.getInt(EclPreferencePage.PREF_RESULT_LIMIT);
        if (resultLimit > 0) {
            options.put("evaluationResultLimit", resultLimit);
        }

        // Formatting options
        Map<String, Object> formatting = new HashMap<>();
        formatting.put("indentSize", store.getInt(EclPreferencePage.PREF_INDENT_SIZE));
        formatting.put("indentStyle", store.getString(EclPreferencePage.PREF_INDENT_STYLE));
        formatting.put("spaceAroundOperators", store.getBoolean(EclPreferencePage.PREF_SPACE_AROUND_OPERATORS));
        formatting.put("maxLineLength", store.getInt(EclPreferencePage.PREF_MAX_LINE_LENGTH));
        formatting.put("alignTerms", store.getBoolean(EclPreferencePage.PREF_ALIGN_TERMS));
        formatting.put("wrapComments", store.getBoolean(EclPreferencePage.PREF_WRAP_COMMENTS));
        formatting.put("breakOnOperators", store.getBoolean(EclPreferencePage.PREF_BREAK_ON_OPERATORS));
        formatting.put("breakOnRefinementComma", store.getBoolean(EclPreferencePage.PREF_BREAK_ON_REFINEMENT_COMMA));
        formatting.put("breakAfterColon", store.getBoolean(EclPreferencePage.PREF_BREAK_AFTER_COLON));
        options.put("formatting", formatting);

        return options;
    }

    /**
     * Find a working Node.js executable.
     *
     * <p>On macOS, GUI apps launched from Finder/Dock get a minimal PATH
     * ({@code /usr/bin:/bin:/usr/sbin:/sbin}) that excludes Homebrew, nvm,
     * and other common Node.js install locations. This method searches
     * well-known paths as a fallback.
     *
     * @return absolute path to node, or {@code "node"} to try PATH as last resort
     */
    private static String findNodeExecutable() {
        for (String candidate : NODE_SEARCH_PATHS) {
            File file = new File(candidate);
            if (file.isFile() && file.canExecute()) {
                return candidate;
            }
        }
        // Last resort: hope 'node' is on PATH
        return "node";
    }

    /**
     * Locate the bundled ECL LSP server script inside the plugin.
     *
     * @return absolute path to the server entry point, or {@code null} if not found
     */
    private String findBundledServer() {
        try {
            URL entry = Platform.getBundle(EclPlugin.PLUGIN_ID)
                    .getEntry("server/bin/ecl-lsp-server.js");
            if (entry != null) {
                URL fileUrl = FileLocator.toFileURL(entry);
                File file = new File(fileUrl.getPath());
                if (file.exists()) {
                    return file.getAbsolutePath();
                }
                logWarn("ECL LSP: bundled server entry resolved but file missing: " + fileUrl.getPath());
            } else {
                logWarn("ECL LSP: no bundle entry for server/bin/ecl-lsp-server.js");
            }
        } catch (IOException | NullPointerException e) {
            logError("ECL LSP: error locating bundled server", e);
        }
        return null;
    }

    private static void logWarn(String message) {
        LOG.log(new Status(IStatus.WARNING, EclPlugin.PLUGIN_ID, message));
    }

    private static void logError(String message, Throwable e) {
        LOG.log(new Status(IStatus.ERROR, EclPlugin.PLUGIN_ID, message, e));
    }
}
