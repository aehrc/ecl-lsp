// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.platform.lsp.api.LspServerSupportProvider
import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * Tests that all ECL plugin extension points are correctly registered
 * in the IntelliJ platform extension registry.
 */
class EclExtensionPointTest : BasePlatformTestCase() {

    fun testLspServerSupportProviderIsRegistered() {
        val ep = ExtensionPointName.create<LspServerSupportProvider>(
            "com.intellij.platform.lsp.serverSupportProvider"
        )
        val providers = ep.extensionList
        val eclProvider = providers.filterIsInstance<EclLspServerSupportProvider>()
        assertTrue(
            "EclLspServerSupportProvider should be registered",
            eclProvider.isNotEmpty()
        )
    }

    fun testEclFileTypeIsRegisteredInFileTypeRegistry() {
        val fileType = com.intellij.openapi.fileTypes.FileTypeManager.getInstance()
            .getFileTypeByExtension("ecl")
        assertEquals("ECL", fileType.name)
    }

    fun testSettingsServiceIsAvailable() {
        val settings = EclSettings.getInstance()
        assertNotNull("EclSettings service should be available", settings)
    }

    fun testSettingsHaveCorrectDefaultValues() {
        val state = EclSettings.State()
        assertEquals("https://tx.ontoserver.csiro.au/fhir", state.serverUrl)
        assertEquals(2000, state.timeout)
        assertEquals("", state.snomedVersion)
        assertTrue(state.semanticValidationEnabled)
        assertEquals(200, state.resultLimit)
        assertEquals(2, state.indentSize)
        assertEquals("space", state.indentStyle)
    }
}
