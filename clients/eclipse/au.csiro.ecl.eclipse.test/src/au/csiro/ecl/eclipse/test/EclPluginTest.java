// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.eclipse.test;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.net.URL;

import org.eclipse.core.runtime.FileLocator;
import org.eclipse.core.runtime.IConfigurationElement;
import org.eclipse.core.runtime.IExtensionRegistry;
import org.eclipse.core.runtime.Platform;
import org.eclipse.core.runtime.content.IContentType;
import org.eclipse.core.runtime.content.IContentTypeManager;
import org.eclipse.jface.preference.IPreferenceStore;
import org.junit.BeforeClass;
import org.junit.Test;
import org.osgi.framework.Bundle;

import au.csiro.ecl.eclipse.EclPlugin;
import au.csiro.ecl.eclipse.EclPreferencePage;
import au.csiro.ecl.eclipse.EclStreamConnectionProvider;

/**
 * Headless tests for the ECL Eclipse plugin — verifies extension point
 * registrations, preference defaults, bundle state, bundled server integrity,
 * and LSP4E wiring without requiring a running LSP server.
 */
public class EclPluginTest {

    private static final String ECL_CONTENT_TYPE_ID = "au.csiro.ecl.eclipse.eclContentType";

    @BeforeClass
    public static void ensurePluginActivated() throws Exception {
        Bundle bundle = Platform.getBundle(EclPlugin.PLUGIN_ID);
        assertNotNull("ECL plugin bundle must be installed", bundle);
        if (bundle.getState() != Bundle.ACTIVE) {
            bundle.start();
        }
    }

    // ── Content type registration ──

    @Test
    public void contentTypeRegisteredForEclFiles() {
        IContentTypeManager manager = Platform.getContentTypeManager();
        IContentType ct = manager.getContentType(ECL_CONTENT_TYPE_ID);
        assertNotNull("ECL content type should be registered", ct);
        assertEquals("SNOMED CT Expression Constraint Language", ct.getName());
    }

    @Test
    public void contentTypeAssociatedWithEclExtension() {
        IContentTypeManager manager = Platform.getContentTypeManager();
        IContentType[] types = manager.findContentTypesFor("test.ecl");
        boolean found = false;
        for (IContentType type : types) {
            if (ECL_CONTENT_TYPE_ID.equals(type.getId())) {
                found = true;
                break;
            }
        }
        assertTrue(".ecl files should be associated with ECL content type", found);
    }

    // ── Bundle state ──

    @Test
    public void pluginBundleIsResolved() {
        Bundle bundle = Platform.getBundle(EclPlugin.PLUGIN_ID);
        assertNotNull("ECL plugin bundle should be installed", bundle);
        int state = bundle.getState();
        assertTrue(
            "Bundle should be at least RESOLVED, was: " + state,
            state == Bundle.RESOLVED || state == Bundle.ACTIVE || state == Bundle.STARTING
        );
    }

    @Test
    public void textMateGrammarBundleAvailable() {
        Bundle tm4eBundle = Platform.getBundle("org.eclipse.tm4e.registry");
        assertNotNull("TM4E registry bundle should be available", tm4eBundle);
        int state = tm4eBundle.getState();
        assertTrue(
            "TM4E registry bundle should be at least RESOLVED, was: " + state,
            state == Bundle.RESOLVED || state == Bundle.ACTIVE || state == Bundle.STARTING
        );
    }

    @Test
    public void lsp4eBundleAvailable() {
        Bundle lsp4eBundle = Platform.getBundle("org.eclipse.lsp4e");
        assertNotNull("LSP4E bundle should be available", lsp4eBundle);
        int state = lsp4eBundle.getState();
        assertTrue(
            "LSP4E bundle should be at least RESOLVED, was: " + state,
            state == Bundle.RESOLVED || state == Bundle.ACTIVE || state == Bundle.STARTING
        );
    }

    // ── Bundled server integrity ──

    @Test
    public void bundledServerEntryPointExists() throws IOException {
        URL entry = Platform.getBundle(EclPlugin.PLUGIN_ID)
                .getEntry("server/bin/ecl-lsp-server.js");
        assertNotNull("Bundled server entry point should exist at server/bin/ecl-lsp-server.js", entry);
        URL fileUrl = FileLocator.toFileURL(entry);
        File file = new File(fileUrl.getPath());
        assertTrue("Server entry point file should exist on disk", file.exists());
    }

    @Test
    public void bundledServerDistExists() throws IOException {
        URL entry = Platform.getBundle(EclPlugin.PLUGIN_ID)
                .getEntry("server/dist/server.js");
        assertNotNull("Bundled server dist/server.js should exist", entry);
        URL fileUrl = FileLocator.toFileURL(entry);
        File file = new File(fileUrl.getPath());
        assertTrue("server/dist/server.js should exist on disk", file.exists());
    }

    @Test
    public void bundledServerHasEclCoreDependency() throws IOException {
        URL entry = Platform.getBundle(EclPlugin.PLUGIN_ID)
                .getEntry("server/node_modules/ecl-core/package.json");
        assertNotNull("ecl-core should be bundled in server/node_modules/ecl-core/", entry);
    }

    @Test
    public void bundledServerHasLspProtocolDependencies() throws IOException {
        String[] requiredModules = {
            "vscode-languageserver",
            "vscode-languageserver-protocol",
            "vscode-languageserver-textdocument",
            "vscode-languageserver-types",
            "vscode-jsonrpc"
        };
        Bundle bundle = Platform.getBundle(EclPlugin.PLUGIN_ID);
        for (String module : requiredModules) {
            URL entry = bundle.getEntry("server/node_modules/" + module + "/package.json");
            assertNotNull(
                "LSP dependency " + module + " should be bundled in server/node_modules/",
                entry
            );
        }
    }

    @Test
    public void bundledServerHasAntlr4tsDependency() throws IOException {
        URL entry = Platform.getBundle(EclPlugin.PLUGIN_ID)
                .getEntry("server/node_modules/antlr4ts/package.json");
        assertNotNull("antlr4ts should be bundled in server/node_modules/antlr4ts/", entry);
    }

    @Test
    public void bundledServerNodeCanLoadIt() throws Exception {
        // Verify Node.js can actually load the server via the bin entry point,
        // matching the real launch path used by EclStreamConnectionProvider.
        URL binEntry = Platform.getBundle(EclPlugin.PLUGIN_ID)
                .getEntry("server/bin/ecl-lsp-server.js");
        URL binFileUrl = FileLocator.toFileURL(binEntry);
        File binFile = new File(binFileUrl.getPath());
        // Resolve the server root (parent of bin/)
        File serverDir = binFile.getParentFile().getParentFile();

        // Force extraction of all server files by touching key entries
        for (String path : new String[]{
            "server/dist/server.js", "server/dist/code-lens.js",
            "server/dist/semantic-tokens.js"
        }) {
            URL e = Platform.getBundle(EclPlugin.PLUGIN_ID).getEntry(path);
            if (e != null) FileLocator.toFileURL(e);
        }

        ProcessBuilder pb = new ProcessBuilder(
            "node", "-e",
            "try { require('" + binFile.getAbsolutePath().replace("'", "\\'") + "'); } " +
            "catch(e) { " +
            "  if (e.code === 'MODULE_NOT_FOUND') { console.error(e.message); process.exit(1); } " +
            "  process.exit(0); " +  // Other errors (no stdio) are expected
            "}"
        );
        pb.directory(serverDir);
        pb.redirectErrorStream(true);
        Process proc = pb.start();
        int exitCode = proc.waitFor();
        if (exitCode != 0) {
            byte[] output = proc.getInputStream().readAllBytes();
            fail("Node.js cannot load bundled server (missing dependency): " + new String(output));
        }
    }

    // ── LSP4E wiring ──

    @Test
    public void lsp4eServerRegistered() {
        IExtensionRegistry registry = Platform.getExtensionRegistry();
        IConfigurationElement[] elements = registry.getConfigurationElementsFor(
            "org.eclipse.lsp4e.languageServer");
        boolean serverFound = false;
        for (IConfigurationElement elem : elements) {
            if ("server".equals(elem.getName()) &&
                "au.csiro.ecl.eclipse.eclServer".equals(elem.getAttribute("id"))) {
                serverFound = true;
                assertEquals(
                    "Server class should be EclStreamConnectionProvider",
                    "au.csiro.ecl.eclipse.EclStreamConnectionProvider",
                    elem.getAttribute("class")
                );
                break;
            }
        }
        assertTrue("ECL language server should be registered with LSP4E", serverFound);
    }

    @Test
    public void lsp4eContentTypeMappingLinksToServer() {
        IExtensionRegistry registry = Platform.getExtensionRegistry();
        IConfigurationElement[] elements = registry.getConfigurationElementsFor(
            "org.eclipse.lsp4e.languageServer");
        boolean mappingFound = false;
        for (IConfigurationElement elem : elements) {
            if ("contentTypeMapping".equals(elem.getName()) &&
                ECL_CONTENT_TYPE_ID.equals(elem.getAttribute("contentType"))) {
                mappingFound = true;
                assertEquals(
                    "Content type mapping id must reference the ECL server",
                    "au.csiro.ecl.eclipse.eclServer",
                    elem.getAttribute("id")
                );
                assertEquals(
                    "Language ID should be 'ecl'",
                    "ecl",
                    elem.getAttribute("languageId")
                );
                break;
            }
        }
        assertTrue("Content type mapping for .ecl should be registered with LSP4E", mappingFound);
    }

    @Test
    public void connectionProviderCanBeInstantiated() {
        // Verifies the constructor doesn't throw — it reads preferences and
        // locates the bundled server, which exercises the full startup path.
        EclStreamConnectionProvider provider = new EclStreamConnectionProvider();
        assertNotNull("Connection provider should be created successfully", provider);
    }

    // ── TextMate grammar ──

    @Test
    public void textMateGrammarFileExists() throws IOException {
        URL entry = Platform.getBundle(EclPlugin.PLUGIN_ID)
                .getEntry("syntaxes/ecl.tmLanguage.json");
        assertNotNull("TextMate grammar file should be bundled", entry);
    }

    @Test
    public void languageConfigurationFileExists() throws IOException {
        URL entry = Platform.getBundle(EclPlugin.PLUGIN_ID)
                .getEntry("language-configurations/ecl.language-configuration.json");
        assertNotNull("Language configuration file should be bundled", entry);
    }

    // ── Preference defaults ──

    @Test
    public void preferenceDefaultFhirUrl() {
        IPreferenceStore store = EclPlugin.getDefault().getPreferenceStore();
        assertEquals(
            "https://tx.ontoserver.csiro.au/fhir",
            store.getDefaultString(EclPreferencePage.PREF_FHIR_URL)
        );
    }

    @Test
    public void preferenceDefaultTimeout() {
        IPreferenceStore store = EclPlugin.getDefault().getPreferenceStore();
        assertEquals(2000, store.getDefaultInt(EclPreferencePage.PREF_TIMEOUT));
    }

    @Test
    public void preferenceDefaultSemanticValidation() {
        IPreferenceStore store = EclPlugin.getDefault().getPreferenceStore();
        assertTrue(store.getDefaultBoolean(EclPreferencePage.PREF_SEMANTIC_VALIDATION));
    }

    @Test
    public void preferenceDefaultResultLimit() {
        IPreferenceStore store = EclPlugin.getDefault().getPreferenceStore();
        assertEquals(200, store.getDefaultInt(EclPreferencePage.PREF_RESULT_LIMIT));
    }

    @Test
    public void preferenceDefaultFormattingIndentSize() {
        IPreferenceStore store = EclPlugin.getDefault().getPreferenceStore();
        assertEquals(2, store.getDefaultInt(EclPreferencePage.PREF_INDENT_SIZE));
    }

    @Test
    public void preferenceDefaultFormattingIndentStyle() {
        IPreferenceStore store = EclPlugin.getDefault().getPreferenceStore();
        assertEquals("space", store.getDefaultString(EclPreferencePage.PREF_INDENT_STYLE));
    }

    @Test
    public void preferenceDefaultSpaceAroundOperators() {
        IPreferenceStore store = EclPlugin.getDefault().getPreferenceStore();
        assertTrue(store.getDefaultBoolean(EclPreferencePage.PREF_SPACE_AROUND_OPERATORS));
    }

    @Test
    public void preferenceDefaultMaxLineLength() {
        IPreferenceStore store = EclPlugin.getDefault().getPreferenceStore();
        assertEquals(80, store.getDefaultInt(EclPreferencePage.PREF_MAX_LINE_LENGTH));
    }
}
