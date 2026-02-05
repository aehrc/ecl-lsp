// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

class SnomedConstantsTest {

    companion object {
        private const val AU_MODULE_ID = "32506021000036107"
        private const val INT_MODULE_ID = "900000000000207008"
        private const val AU_EDITION_URI = "http://snomed.info/sct/32506021000036107"
        private const val AU_PINNED_URI = "http://snomed.info/sct/32506021000036107/version/20260131"
    }

    // ── parseSnomedVersionUri ───────────────────────────────────────────

    @Test
    fun parseSnomedVersionUriParsesPinnedVersionUri() {
        val result = parseSnomedVersionUri(AU_PINNED_URI)
        assertNotNull(result)
        assertEquals(AU_MODULE_ID, result!!.first)
        assertEquals("20260131", result.second)
    }

    @Test
    fun parseSnomedVersionUriParsesEditionOnlyUri() {
        val result = parseSnomedVersionUri(AU_EDITION_URI)
        assertNotNull(result)
        assertEquals(AU_MODULE_ID, result!!.first)
        assertNull(result.second)
    }

    @Test
    fun parseSnomedVersionUriReturnsNullForInvalidUri() {
        assertNull(parseSnomedVersionUri("not-a-uri"))
    }

    @Test
    fun parseSnomedVersionUriReturnsNullForEmptyString() {
        assertNull(parseSnomedVersionUri(""))
    }

    @Test
    fun parseSnomedVersionUriReturnsNullForHttpsScheme() {
        assertNull(parseSnomedVersionUri("https://snomed.info/sct/$AU_MODULE_ID"))
    }

    @Test
    fun parseSnomedVersionUriParsesInternationalModule() {
        val result = parseSnomedVersionUri("http://snomed.info/sct/$INT_MODULE_ID/version/20240101")
        assertNotNull(result)
        assertEquals(INT_MODULE_ID, result!!.first)
        assertEquals("20240101", result.second)
    }

    @Test
    fun parseSnomedVersionUriRejectsUriWithTrailingSlash() {
        assertNull(parseSnomedVersionUri("$AU_EDITION_URI/"))
    }

    @Test
    fun parseSnomedVersionUriRejectsUriWithExtraPathSegments() {
        assertNull(parseSnomedVersionUri("$AU_PINNED_URI/extra"))
    }

    @Test
    fun parseSnomedVersionUriRejectsUriWithNonDigitModule() {
        assertNull(parseSnomedVersionUri("http://snomed.info/sct/abc123"))
    }

    // ── getEditionLabel ─────────────────────────────────────────────────

    @Test
    fun getEditionLabelReturnsInternationalForInternationalModule() {
        assertEquals("International", getEditionLabel(INT_MODULE_ID))
    }

    @Test
    fun getEditionLabelReturnsAustralianForAuModule() {
        assertEquals("Australian", getEditionLabel(AU_MODULE_ID))
    }

    @Test
    fun getEditionLabelReturnsUsForUsModule() {
        assertEquals("US", getEditionLabel("731000124108"))
    }

    @Test
    fun getEditionLabelReturnsUkClinicalForUkClinicalModule() {
        assertEquals("UK Clinical", getEditionLabel("999000011000000103"))
    }

    @Test
    fun getEditionLabelReturnsModuleIdForUnknownModule() {
        assertEquals("9999999999", getEditionLabel("9999999999"))
    }

    @Test
    fun getEditionLabelReturnsIpsTerminology() {
        assertEquals("IPS Terminology", getEditionLabel("999991001000101"))
    }

    // ── formatSnomedDate ────────────────────────────────────────────────

    @Test
    fun formatSnomedDateFormats8DigitDateAsYyyyMmDd() {
        assertEquals("2026-01-31", formatSnomedDate("20260131"))
    }

    @Test
    fun formatSnomedDateReturnsInputUnchangedIfNot8Digits() {
        assertEquals("202601", formatSnomedDate("202601"))
    }

    @Test
    fun formatSnomedDateHandlesFirstDayOfYear() {
        assertEquals("2026-01-01", formatSnomedDate("20260101"))
    }

    @Test
    fun formatSnomedDateHandlesLastDayOfYear() {
        assertEquals("2026-12-31", formatSnomedDate("20261231"))
    }

    @Test
    fun formatSnomedDateReturnsEmptyStringUnchanged() {
        assertEquals("", formatSnomedDate(""))
    }

    @Test
    fun formatSnomedDateHandles9DigitInputUnchanged() {
        assertEquals("202601311", formatSnomedDate("202601311"))
    }

    // ── MODULE_TO_COUNTRY map ───────────────────────────────────────────

    @Test
    fun moduleToCountryHas28Entries() {
        assertEquals(28, MODULE_TO_COUNTRY.size)
    }

    @Test
    fun moduleToCountryIncludesAllMajorEditions() {
        val expected = listOf(
            "International", "Australian", "US", "UK Clinical", "UK Drug",
            "Belgian", "Danish", "Dutch", "Estonian", "Irish",
            "Swedish", "Canadian", "German", "Norwegian", "Austrian",
            "Swiss", "French", "Spanish", "Jamaican",
        )
        val values = MODULE_TO_COUNTRY.values.toList()
        for (edition in expected) {
            assertTrue(values.contains(edition), "should include $edition")
        }
    }

    @Test
    fun moduleToCountryHasUniqueKeys() {
        // Map enforces unique keys, but verify all expected keys are present
        assertTrue(MODULE_TO_COUNTRY.containsKey(INT_MODULE_ID), "International key")
        assertTrue(MODULE_TO_COUNTRY.containsKey(AU_MODULE_ID), "Australian key")
        assertTrue(MODULE_TO_COUNTRY.containsKey("731000124108"), "US key")
    }
}
