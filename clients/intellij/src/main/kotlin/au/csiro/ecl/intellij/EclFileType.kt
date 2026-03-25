// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import com.intellij.openapi.fileTypes.LanguageFileType
import com.intellij.lang.Language
import javax.swing.Icon

object EclLanguage : Language("ECL")

object EclFileType : LanguageFileType(EclLanguage) {
    override fun getName(): String = "ECL"
    override fun getDescription(): String = "SNOMED CT Expression Constraint Language"
    override fun getDefaultExtension(): String = "ecl"
    override fun getIcon(): Icon = EclIcons.FILE
}
