package au.csiro.ecl.intellij

import org.junit.Assert.*
import org.junit.Test

class EclLspServerDescriptorTest {

    // --- isSupportedFileExtension ---

    @Test
    fun `isSupportedFileExtension returns true for ecl`() {
        assertTrue(EclLspServerDescriptor.isSupportedFileExtension("ecl"))
    }

    @Test
    fun `isSupportedFileExtension returns false for txt`() {
        assertFalse(EclLspServerDescriptor.isSupportedFileExtension("txt"))
    }

    @Test
    fun `isSupportedFileExtension returns false for java`() {
        assertFalse(EclLspServerDescriptor.isSupportedFileExtension("java"))
    }

    @Test
    fun `isSupportedFileExtension returns false for null`() {
        assertFalse(EclLspServerDescriptor.isSupportedFileExtension(null))
    }

    // --- buildWorkspaceConfiguration ---

    @Test
    fun `buildWorkspaceConfiguration returns terminology settings`() {
        val settings = EclSettings()
        val result = EclLspServerDescriptor.buildWorkspaceConfiguration("ecl.terminology", settings)
        assertNotNull(result)
        assertTrue(result is Map<*, *>)
        val map = result as Map<*, *>
        assertEquals("https://tx.ontoserver.csiro.au/fhir", map["serverUrl"])
        assertEquals(2000, map["timeout"])
        assertEquals("", map["snomedVersion"])
    }

    @Test
    fun `buildWorkspaceConfiguration returns formatting settings`() {
        val settings = EclSettings()
        val result = EclLspServerDescriptor.buildWorkspaceConfiguration("ecl.formatting", settings)
        assertNotNull(result)
        val map = result as Map<*, *>
        assertEquals(2, map["indentSize"])
        assertEquals("space", map["indentStyle"])
        assertEquals(true, map["spaceAroundOperators"])
        assertEquals(80, map["maxLineLength"])
        assertEquals(true, map["alignTerms"])
        assertEquals(false, map["wrapComments"])
        assertEquals(false, map["breakOnOperators"])
        assertEquals(false, map["breakOnRefinementComma"])
        assertEquals(false, map["breakAfterColon"])
    }

    @Test
    fun `buildWorkspaceConfiguration returns evaluation settings`() {
        val settings = EclSettings()
        val result = EclLspServerDescriptor.buildWorkspaceConfiguration("ecl.evaluation", settings)
        assertNotNull(result)
        val map = result as Map<*, *>
        assertEquals(200, map["resultLimit"])
    }

    @Test
    fun `buildWorkspaceConfiguration returns semantic validation settings`() {
        val settings = EclSettings()
        val result = EclLspServerDescriptor.buildWorkspaceConfiguration("ecl.semanticValidation", settings)
        assertNotNull(result)
        val map = result as Map<*, *>
        assertEquals(true, map["enabled"])
    }

    @Test
    fun `buildWorkspaceConfiguration returns null for unknown section`() {
        val settings = EclSettings()
        val result = EclLspServerDescriptor.buildWorkspaceConfiguration("ecl.unknown", settings)
        assertNull(result)
    }

    @Test
    fun `buildWorkspaceConfiguration returns null for null section`() {
        val settings = EclSettings()
        val result = EclLspServerDescriptor.buildWorkspaceConfiguration(null, settings)
        assertNull(result)
    }

    @Test
    fun `buildWorkspaceConfiguration reflects mutated settings`() {
        val settings = EclSettings()
        settings.state.serverUrl = "http://localhost:8080/fhir"
        settings.state.timeout = 5000
        settings.state.indentSize = 4

        val terminology = EclLspServerDescriptor.buildWorkspaceConfiguration("ecl.terminology", settings) as Map<*, *>
        assertEquals("http://localhost:8080/fhir", terminology["serverUrl"])
        assertEquals(5000, terminology["timeout"])

        val formatting = EclLspServerDescriptor.buildWorkspaceConfiguration("ecl.formatting", settings) as Map<*, *>
        assertEquals(4, formatting["indentSize"])
    }
}
