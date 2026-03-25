package au.csiro.ecl.intellij

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class EclSettingsTest {

    private lateinit var settings: EclSettings

    @Before
    fun setUp() {
        settings = EclSettings()
    }

    // --- Default values ---

    @Test
    fun `default serverUrl`() {
        assertEquals("https://tx.ontoserver.csiro.au/fhir", settings.state.serverUrl)
    }

    @Test
    fun `default timeout`() {
        assertEquals(2000, settings.state.timeout)
    }

    @Test
    fun `default snomedVersion is empty`() {
        assertEquals("", settings.state.snomedVersion)
    }

    @Test
    fun `default semanticValidationEnabled is true`() {
        assertTrue(settings.state.semanticValidationEnabled)
    }

    @Test
    fun `default resultLimit`() {
        assertEquals(200, settings.state.resultLimit)
    }

    @Test
    fun `default indentSize`() {
        assertEquals(2, settings.state.indentSize)
    }

    @Test
    fun `default indentStyle`() {
        assertEquals("space", settings.state.indentStyle)
    }

    @Test
    fun `default spaceAroundOperators is true`() {
        assertTrue(settings.state.spaceAroundOperators)
    }

    @Test
    fun `default maxLineLength`() {
        assertEquals(80, settings.state.maxLineLength)
    }

    @Test
    fun `default alignTerms is true`() {
        assertTrue(settings.state.alignTerms)
    }

    @Test
    fun `default wrapComments is false`() {
        assertFalse(settings.state.wrapComments)
    }

    @Test
    fun `default breakOnOperators is false`() {
        assertFalse(settings.state.breakOnOperators)
    }

    @Test
    fun `default breakOnRefinementComma is false`() {
        assertFalse(settings.state.breakOnRefinementComma)
    }

    @Test
    fun `default breakAfterColon is false`() {
        assertFalse(settings.state.breakAfterColon)
    }

    // --- Mutations ---

    @Test
    fun `mutating serverUrl persists`() {
        settings.state.serverUrl = "http://localhost:8080/fhir"
        assertEquals("http://localhost:8080/fhir", settings.state.serverUrl)
    }

    @Test
    fun `mutating timeout persists`() {
        settings.state.timeout = 5000
        assertEquals(5000, settings.state.timeout)
    }

    @Test
    fun `mutating snomedVersion persists`() {
        settings.state.snomedVersion = "http://snomed.info/sct/32506021000036107"
        assertEquals("http://snomed.info/sct/32506021000036107", settings.state.snomedVersion)
    }

    @Test
    fun `mutating formatting options persists`() {
        settings.state.indentSize = 4
        settings.state.maxLineLength = 120
        settings.state.breakOnOperators = true
        assertEquals(4, settings.state.indentSize)
        assertEquals(120, settings.state.maxLineLength)
        assertTrue(settings.state.breakOnOperators)
    }
}
