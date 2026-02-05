package au.csiro.ecl.intellij

import org.junit.Assert.*
import org.junit.Test

class SnomedConstantsTest {

    // --- parseSnomedVersionUri ---

    @Test
    fun `parseSnomedVersionUri parses pinned URI`() {
        val result = parseSnomedVersionUri("http://snomed.info/sct/32506021000036107/version/20240731")
        assertNotNull(result)
        assertEquals("32506021000036107", result!!.first)
        assertEquals("20240731", result.second)
    }

    @Test
    fun `parseSnomedVersionUri parses edition-only URI`() {
        val result = parseSnomedVersionUri("http://snomed.info/sct/900000000000207008")
        assertNotNull(result)
        assertEquals("900000000000207008", result!!.first)
        assertNull(result.second)
    }

    @Test
    fun `parseSnomedVersionUri returns null for invalid URI`() {
        assertNull(parseSnomedVersionUri("not-a-uri"))
        assertNull(parseSnomedVersionUri("http://snomed.info/sct/"))
        assertNull(parseSnomedVersionUri("http://example.com"))
    }

    @Test
    fun `parseSnomedVersionUri returns null for empty string`() {
        assertNull(parseSnomedVersionUri(""))
    }

    // --- getEditionLabel ---

    @Test
    fun `getEditionLabel returns International for known module`() {
        assertEquals("International", getEditionLabel("900000000000207008"))
    }

    @Test
    fun `getEditionLabel returns Australian for AU module`() {
        assertEquals("Australian", getEditionLabel("32506021000036107"))
    }

    @Test
    fun `getEditionLabel returns US for US module`() {
        assertEquals("US", getEditionLabel("731000124108"))
    }

    @Test
    fun `getEditionLabel returns module ID for unknown module`() {
        assertEquals("999999999", getEditionLabel("999999999"))
    }

    // --- formatSnomedDate ---

    @Test
    fun `formatSnomedDate formats valid 8-char date`() {
        assertEquals("2024-07-31", formatSnomedDate("20240731"))
    }

    @Test
    fun `formatSnomedDate returns short string as-is`() {
        assertEquals("2024", formatSnomedDate("2024"))
    }

    @Test
    fun `formatSnomedDate returns empty string as-is`() {
        assertEquals("", formatSnomedDate(""))
    }
}
