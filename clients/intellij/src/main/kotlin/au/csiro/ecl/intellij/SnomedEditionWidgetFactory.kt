// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory

class SnomedEditionWidgetFactory : StatusBarWidgetFactory {
    override fun getId(): String = "ecl.snomedEdition"
    override fun getDisplayName(): String = "SNOMED CT Edition"
    override fun isAvailable(project: Project): Boolean = true

    override fun createWidget(project: Project): StatusBarWidget {
        return SnomedEditionWidget(project)
    }
}
