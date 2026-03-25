// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.*

@Service
@State(
    name = "au.csiro.ecl.EclSettings",
    storages = [Storage("ecl-lsp.xml")]
)
class EclSettings : SimplePersistentStateComponent<EclSettings.State>(State()) {

    class State : BaseState() {
        // Terminology
        var serverUrl by string("https://tx.ontoserver.csiro.au/fhir")
        var timeout by property(2000)
        var snomedVersion by string("")
        var semanticValidationEnabled by property(true)

        // Evaluation
        var resultLimit by property(200)

        // Formatting
        var indentSize by property(2)
        var indentStyle by string("space")
        var spaceAroundOperators by property(true)
        var maxLineLength by property(80)
        var alignTerms by property(true)
        var wrapComments by property(false)
        var breakOnOperators by property(false)
        var breakOnRefinementComma by property(false)
        var breakAfterColon by property(false)
    }

    companion object {
        fun getInstance(): EclSettings =
            ApplicationManager.getApplication().getService(EclSettings::class.java)
    }
}
