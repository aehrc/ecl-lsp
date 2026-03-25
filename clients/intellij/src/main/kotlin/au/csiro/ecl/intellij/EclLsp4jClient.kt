// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import com.intellij.openapi.application.ApplicationManager
import com.intellij.platform.lsp.api.Lsp4jClient
import com.intellij.platform.lsp.api.LspServerNotificationsHandler
import com.intellij.util.messages.Topic
import org.eclipse.lsp4j.jsonrpc.services.JsonNotification

class EclLsp4jClient(handler: LspServerNotificationsHandler) : Lsp4jClient(handler) {

    @JsonNotification("ecl/resolvedSnomedVersion")
    fun onResolvedSnomedVersion(params: SnomedVersionParams) {
        ApplicationManager.getApplication().messageBus
            .syncPublisher(EclSnomedVersionListener.TOPIC)
            .versionResolved(params.versionUri)
    }
}

data class SnomedVersionParams(val versionUri: String = "")

fun interface EclSnomedVersionListener {
    fun versionResolved(versionUri: String)

    companion object {
        val TOPIC = Topic.create("ECL SNOMED Version", EclSnomedVersionListener::class.java)
    }
}
