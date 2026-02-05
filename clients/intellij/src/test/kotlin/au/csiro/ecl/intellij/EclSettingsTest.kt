// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

/**
 * Tests for EclSettings.State default values.
 *
 * These verify that the default state matches expected values without
 * requiring an IntelliJ platform instance.
 */
class EclSettingsTest {

    @Test
    fun stateDefaultsServerUrlIsOntoserver() {
        val state = EclSettings.State()
        assertEquals("https://tx.ontoserver.csiro.au/fhir", state.serverUrl)
    }

    @Test
    fun stateDefaultsTimeoutIs2000ms() {
        val state = EclSettings.State()
        assertEquals(2000, state.timeout)
    }

    @Test
    fun stateDefaultsSnomedVersionIsEmpty() {
        val state = EclSettings.State()
        assertEquals("", state.snomedVersion)
    }

    @Test
    fun stateDefaultsSemanticValidationIsEnabled() {
        val state = EclSettings.State()
        assertTrue(state.semanticValidationEnabled)
    }

    @Test
    fun stateDefaultsResultLimitIs200() {
        val state = EclSettings.State()
        assertEquals(200, state.resultLimit)
    }

    @Test
    fun stateDefaultsIndentSizeIs2() {
        val state = EclSettings.State()
        assertEquals(2, state.indentSize)
    }

    @Test
    fun stateDefaultsIndentStyleIsSpace() {
        val state = EclSettings.State()
        assertEquals("space", state.indentStyle)
    }

    @Test
    fun stateDefaultsSpaceAroundOperatorsIsTrue() {
        val state = EclSettings.State()
        assertTrue(state.spaceAroundOperators)
    }

    @Test
    fun stateDefaultsMaxLineLengthIs80() {
        val state = EclSettings.State()
        assertEquals(80, state.maxLineLength)
    }

    @Test
    fun stateDefaultsAlignTermsIsTrue() {
        val state = EclSettings.State()
        assertTrue(state.alignTerms)
    }

    @Test
    fun stateDefaultsWrapCommentsIsFalse() {
        val state = EclSettings.State()
        assertFalse(state.wrapComments)
    }

    @Test
    fun stateDefaultsBreakOnOperatorsIsFalse() {
        val state = EclSettings.State()
        assertFalse(state.breakOnOperators)
    }

    @Test
    fun stateDefaultsBreakOnRefinementCommaIsFalse() {
        val state = EclSettings.State()
        assertFalse(state.breakOnRefinementComma)
    }

    @Test
    fun stateDefaultsBreakAfterColonIsFalse() {
        val state = EclSettings.State()
        assertFalse(state.breakAfterColon)
    }
}
