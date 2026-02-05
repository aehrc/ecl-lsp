// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.extensions.PluginId
import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * Tests for EclLspServerDescriptor — verifies server command line construction,
 * file support detection, workspace configuration mapping, and bundled server integrity.
 */
class EclLspServerDescriptorTest : BasePlatformTestCase() {

    companion object {
        private const val PLUGIN_ID = "au.csiro.ecl.intellij"
        private const val PLUGIN_PATH_ASSERTION = "Plugin path should be available"
    }

    private lateinit var descriptor: EclLspServerDescriptor

    override fun setUp() {
        super.setUp()
        descriptor = EclLspServerDescriptor(project)
    }

    fun testIsSupportedFileReturnsTrueForEclFiles() {
        val file = myFixture.configureByText("test.ecl", "< 404684003")
        assertTrue(descriptor.isSupportedFile(file.virtualFile))
    }

    fun testIsSupportedFileReturnsFalseForNonEclFiles() {
        val file = myFixture.configureByText("test.txt", "< 404684003")
        assertFalse(descriptor.isSupportedFile(file.virtualFile))
    }

    fun testCreateCommandLineUsesStdioFlag() {
        val cmdLine = descriptor.createCommandLine()
        assertTrue(
            "Command line should include --stdio flag: ${cmdLine.commandLineString}",
            cmdLine.commandLineString.contains("--stdio")
        )
    }

    fun testCreateCommandLineUsesConsoleParentEnvironment() {
        val cmdLine = descriptor.createCommandLine()
        assertEquals(
            com.intellij.execution.configurations.GeneralCommandLine.ParentEnvironmentType.CONSOLE,
            cmdLine.parentEnvironmentType
        )
    }

    // ── Bundled server integrity ──

    fun testBundledServerEntryPointExists() {
        val pluginPath = PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID))?.pluginPath
        assertNotNull(PLUGIN_PATH_ASSERTION, pluginPath)
        val serverJs = pluginPath!!.resolve("ecl-lsp-server/dist/server.js").toFile()
        assertTrue("Bundled server dist/server.js should exist at $serverJs", serverJs.exists())
    }

    fun testBundledServerHasEclCoreDependency() {
        val pluginPath = PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID))?.pluginPath
        assertNotNull(PLUGIN_PATH_ASSERTION, pluginPath)
        val eclCore = pluginPath!!.resolve("ecl-lsp-server/node_modules/ecl-core/package.json").toFile()
        assertTrue("ecl-core should be bundled", eclCore.exists())
    }

    fun testBundledServerHasAllLspProtocolDependencies() {
        val pluginPath = PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID))?.pluginPath
        assertNotNull(PLUGIN_PATH_ASSERTION, pluginPath)
        val requiredModules = listOf(
            "vscode-languageserver",
            "vscode-languageserver-protocol",
            "vscode-languageserver-textdocument",
            "vscode-languageserver-types",
            "vscode-jsonrpc",
            "antlr4ts"
        )
        for (module in requiredModules) {
            val pkg = pluginPath!!.resolve("ecl-lsp-server/node_modules/$module/package.json").toFile()
            assertTrue("$module should be bundled in ecl-lsp-server/node_modules/", pkg.exists())
        }
    }

    fun testBundledServerCanBeLoadedByNode() {
        val pluginPath = PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID))?.pluginPath
        assertNotNull(PLUGIN_PATH_ASSERTION, pluginPath)
        val serverJs = pluginPath!!.resolve("ecl-lsp-server/dist/server.js")
        val serverDir = pluginPath.resolve("ecl-lsp-server")

        val process = ProcessBuilder(
            "node", "-e",
            """try { require('${serverJs.toString().replace("\\", "\\\\")}'); } catch(e) { if (e.code === 'MODULE_NOT_FOUND') { console.error(e.message); process.exit(1); } process.exit(0); }"""
        ).apply {
            environment()["NODE_PATH"] = serverDir.resolve("node_modules").toString()
            redirectErrorStream(true)
        }.start()

        val exitCode = process.waitFor()
        if (exitCode != 0) {
            val output = process.inputStream.bufferedReader().readText()
            fail("Node.js cannot load bundled server (missing dependency): $output")
        }
    }

    fun testWorkspaceConfigurationReturnsTerminologySettings() {
        val item = org.eclipse.lsp4j.ConfigurationItem().apply { section = "ecl.terminology" }
        val config = descriptor.getWorkspaceConfiguration(item)
        assertNotNull(config)
        assertTrue(config is Map<*, *>)
        val map = config as Map<*, *>
        assertTrue(map.containsKey("serverUrl"))
        assertTrue(map.containsKey("timeout"))
        assertTrue(map.containsKey("snomedVersion"))
    }

    fun testWorkspaceConfigurationReturnsFormattingSettings() {
        val item = org.eclipse.lsp4j.ConfigurationItem().apply { section = "ecl.formatting" }
        val config = descriptor.getWorkspaceConfiguration(item)
        assertNotNull(config)
        val map = config as Map<*, *>
        assertTrue(map.containsKey("indentSize"))
        assertTrue(map.containsKey("indentStyle"))
        assertTrue(map.containsKey("spaceAroundOperators"))
        assertTrue(map.containsKey("maxLineLength"))
        assertTrue(map.containsKey("alignTerms"))
        assertTrue(map.containsKey("wrapComments"))
        assertTrue(map.containsKey("breakOnOperators"))
        assertTrue(map.containsKey("breakOnRefinementComma"))
        assertTrue(map.containsKey("breakAfterColon"))
    }

    fun testWorkspaceConfigurationReturnsEvaluationSettings() {
        val item = org.eclipse.lsp4j.ConfigurationItem().apply { section = "ecl.evaluation" }
        val config = descriptor.getWorkspaceConfiguration(item)
        assertNotNull(config)
        val map = config as Map<*, *>
        assertTrue(map.containsKey("resultLimit"))
    }

    fun testWorkspaceConfigurationReturnsSemanticValidationSettings() {
        val item = org.eclipse.lsp4j.ConfigurationItem().apply { section = "ecl.semanticValidation" }
        val config = descriptor.getWorkspaceConfiguration(item)
        assertNotNull(config)
        val map = config as Map<*, *>
        assertTrue(map.containsKey("enabled"))
    }

    fun testWorkspaceConfigurationReturnsNullForUnknownSection() {
        val item = org.eclipse.lsp4j.ConfigurationItem().apply { section = "ecl.unknown" }
        val config = descriptor.getWorkspaceConfiguration(item)
        assertNull(config)
    }
}
