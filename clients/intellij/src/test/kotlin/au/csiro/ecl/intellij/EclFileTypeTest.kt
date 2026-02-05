// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * Tests that the ECL file type and language are properly registered
 * and recognized by the IntelliJ platform.
 */
class EclFileTypeTest : BasePlatformTestCase() {

    companion object {
        private const val SAMPLE_ECL = "< 404684003"
    }

    fun testEclFileTypeIsRecognizedForDotEclFiles() {
        val file = myFixture.configureByText("test.ecl", SAMPLE_ECL)
        assertEquals("ECL", file.fileType.name)
    }

    fun testEclLanguageIsEcl() {
        val file = myFixture.configureByText("test.ecl", SAMPLE_ECL)
        assertEquals("ECL", file.fileType.name)
        assertEquals("ECL", EclLanguage.displayName)
    }

    fun testEclFileTypeHasCorrectDefaultExtension() {
        assertEquals("ecl", EclFileType.defaultExtension)
    }

    fun testEclFileTypeHasCorrectDescription() {
        assertEquals("SNOMED CT Expression Constraint Language", EclFileType.description)
    }

    fun testNonEclFileIsNotRecognizedAsEcl() {
        val file = myFixture.configureByText("test.txt", SAMPLE_ECL)
        assertNotSame("ECL", file.fileType.name)
    }
}
