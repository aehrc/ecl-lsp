// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.ui.DialogPanel
import com.intellij.platform.lsp.api.LspServerManager
import com.intellij.ui.dsl.builder.*

class EclSettingsConfigurable : BoundConfigurable("ECL Language Server") {

    private val settings get() = EclSettings.getInstance()

    override fun apply() {
        super.apply()
        for (project in ProjectManager.getInstance().openProjects) {
            LspServerManager.getInstance(project)
                .stopAndRestartIfNeeded(EclLspServerSupportProvider::class.java)
        }
    }

    override fun createPanel(): DialogPanel = panel {
        group("FHIR Terminology Server") {
            row("Server URL:") {
                textField()
                    .bindText(
                        { settings.state.serverUrl ?: "https://tx.ontoserver.csiro.au/fhir" },
                        { settings.state.serverUrl = it }
                    )
                    .align(AlignX.FILL)
                    .comment("Base URL of the FHIR terminology server")
            }
            row("Timeout (ms):") {
                intTextField(500..30000)
                    .bindIntText(settings.state::timeout)
                    .comment("Timeout for concept lookup requests")
            }
            row("SNOMED CT Edition:") {
                textField()
                    .bindText(
                        { settings.state.snomedVersion ?: "" },
                        { settings.state.snomedVersion = it }
                    )
                    .align(AlignX.FILL)
                    .comment("Edition/version URI (empty = server default). Use the status bar widget to select interactively.")
            }
            row {
                checkBox("Enable semantic validation")
                    .bindSelected(settings.state::semanticValidationEnabled)
                    .comment("Attribute scope, value constraints, empty sub-expressions")
            }
        }

        group("Evaluation") {
            row("Result limit:") {
                intTextField(1..10000)
                    .bindIntText(settings.state::resultLimit)
                    .comment("Maximum concepts returned when evaluating an ECL expression")
            }
        }

        group("Formatting") {
            row("Indent size:") {
                intTextField(1..8)
                    .bindIntText(settings.state::indentSize)
            }
            row("Indent style:") {
                comboBox(listOf("space", "tab"))
                    .bindItem(settings.state::indentStyle)
            }
            row("Max line length:") {
                intTextField(0..500)
                    .bindIntText(settings.state::maxLineLength)
                    .comment("0 = unlimited")
            }
            row {
                checkBox("Space around operators")
                    .bindSelected(settings.state::spaceAroundOperators)
            }
            row {
                checkBox("Align terms")
                    .bindSelected(settings.state::alignTerms)
            }
            row {
                checkBox("Wrap comments")
                    .bindSelected(settings.state::wrapComments)
            }
            row {
                checkBox("Break on operators")
                    .bindSelected(settings.state::breakOnOperators)
            }
            row {
                checkBox("Break on refinement comma")
                    .bindSelected(settings.state::breakOnRefinementComma)
            }
            row {
                checkBox("Break after colon")
                    .bindSelected(settings.state::breakAfterColon)
            }
        }
    }
}
