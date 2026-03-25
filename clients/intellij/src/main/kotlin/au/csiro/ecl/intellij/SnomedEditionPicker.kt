// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.PopupStep
import com.intellij.openapi.ui.popup.util.BaseListPopupStep
import com.intellij.platform.lsp.api.LspServerManager
import java.awt.Component

object SnomedEditionPicker {
    private val log = Logger.getInstance(SnomedEditionPicker::class.java)

    fun show(project: Project, component: Component?, onComplete: () -> Unit) {
        // Try to get editions from the LSP server
        val eclServer = findEclServer(project)
        if (eclServer != null) {
            fetchAndShowEditions(project, component, eclServer, onComplete)
        } else {
            showManualInput(project, onComplete)
        }
    }

    private fun findEclServer(project: Project): EclLanguageServer? {
        return try {
            @Suppress("UnstableApiUsage")
            val lspManager = LspServerManager.getInstance(project)
            val servers = lspManager.getServersForProvider(EclLspServerSupportProvider::class.java)
            val lspServer = servers.firstOrNull()
            if (lspServer == null) {
                log.info("No ECL LSP server found from LspServerManager")
                return null
            }

            // The lsp4j server proxy method is Kotlin-internal in LspServerImpl,
            // so its JVM name is mangled with the module suffix.
            val method = lspServer.javaClass.methods.firstOrNull { m ->
                m.name.startsWith("getLsp4jServer")
            }
            if (method == null) {
                log.warn("No getLsp4jServer* method found on ${lspServer.javaClass.name}")
                return null
            }
            val result = method.invoke(lspServer)
            result as? EclLanguageServer
        } catch (e: Exception) {
            log.warn("Failed to find ECL LSP server", e)
            null
        }
    }

    private fun fetchAndShowEditions(
        project: Project,
        component: Component?,
        server: EclLanguageServer,
        onComplete: () -> Unit
    ) {
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val response = server.getSnomedEditions().get()
                val editions = response.editions
                if (editions.isEmpty()) {
                    ApplicationManager.getApplication().invokeLater {
                        showManualInput(project, onComplete)
                    }
                    return@executeOnPooledThread
                }

                ApplicationManager.getApplication().invokeLater {
                    showEditionPopup(component, editions, onComplete)
                }
            } catch (_: Exception) {
                ApplicationManager.getApplication().invokeLater {
                    showManualInput(project, onComplete)
                }
            }
        }
    }

    private data class EditionItem(val label: String, val edition: SnomedEdition?)

    private fun showEditionPopup(
        component: Component?,
        editions: List<SnomedEdition>,
        onComplete: () -> Unit
    ) {
        val items = buildEditionItems(editions)

        val step = object : BaseListPopupStep<EditionItem>("Select SNOMED CT Edition", items) {
            override fun getTextFor(value: EditionItem): String = value.label

            override fun onChosen(selectedValue: EditionItem, finalChoice: Boolean): PopupStep<*>? {
                return handleEditionChoice(selectedValue, onComplete)
            }

            override fun hasSubstep(selectedValue: EditionItem?): Boolean {
                return selectedValue?.edition != null && selectedValue.edition.versions.isNotEmpty()
            }
        }

        val popup = JBPopupFactory.getInstance().createListPopup(step)
        if (component != null) {
            popup.showUnderneathOf(component)
        } else {
            popup.showInFocusCenter()
        }
    }

    private fun buildEditionItems(editions: List<SnomedEdition>): List<EditionItem> {
        val items = mutableListOf<EditionItem>()
        items.add(EditionItem("(Server Default)", null))

        // International edition first
        val international = editions.find { it.moduleId == "900000000000207008" }
        if (international != null) {
            items.add(EditionItem("International${versionCountSuffix(international)}", international))
        }

        // Remaining editions, sorted alphabetically by label
        editions
            .filter { it.moduleId != "900000000000207008" }
            .sortedBy { getEditionLabel(it.moduleId) }
            .forEach {
                val label = getEditionLabel(it.moduleId)
                items.add(EditionItem("$label${versionCountSuffix(it)}", it))
            }
        return items
    }

    private fun versionCountSuffix(edition: SnomedEdition): String {
        val count = edition.versions.size
        if (count <= 0) return ""
        val plural = if (count != 1) "s" else ""
        return "  ($count version$plural)"
    }

    private fun handleEditionChoice(selectedValue: EditionItem, onComplete: () -> Unit): PopupStep<*>? {
        if (selectedValue.edition == null) {
            // Server Default selected -- clear the setting
            EclSettings.getInstance().state.snomedVersion = ""
            onComplete()
            return PopupStep.FINAL_CHOICE
        }

        val edition = selectedValue.edition
        if (edition.versions.isEmpty()) {
            // No version information, set edition-only URI
            EclSettings.getInstance().state.snomedVersion =
                "http://snomed.info/sct/${edition.moduleId}"
            onComplete()
            return PopupStep.FINAL_CHOICE
        }

        // Show version picker as step 2
        return createVersionStep(edition, onComplete)
    }

    private fun createVersionStep(
        edition: SnomedEdition,
        onComplete: () -> Unit
    ): PopupStep<*> {
        data class VersionItem(val label: String, val uri: String)

        val editionLabel = getEditionLabel(edition.moduleId)
        val items = mutableListOf<VersionItem>()

        // "Latest" at the top -- edition-only URI
        items.add(VersionItem("Latest  (always use newest)", "http://snomed.info/sct/${edition.moduleId}"))

        // Available versions, most recent first (they should already come sorted but sort to be safe)
        edition.versions
            .sortedByDescending { it.date }
            .forEach {
                val dateLabel = formatSnomedDate(it.date)
                items.add(VersionItem(dateLabel, it.uri))
            }

        return object : BaseListPopupStep<VersionItem>("Select Version for $editionLabel", items) {
            override fun getTextFor(value: VersionItem): String = value.label

            override fun onChosen(selectedValue: VersionItem, finalChoice: Boolean): PopupStep<*>? {
                EclSettings.getInstance().state.snomedVersion = selectedValue.uri
                onComplete()
                return PopupStep.FINAL_CHOICE
            }
        }
    }

    private fun showManualInput(project: Project, onComplete: () -> Unit) {
        val currentUri = EclSettings.getInstance().state.snomedVersion ?: ""
        val result = Messages.showInputDialog(
            project,
            "Enter SNOMED CT edition URI (e.g., http://snomed.info/sct/32506021000036107)\n" +
                "Leave empty for server default.",
            "SNOMED CT Edition",
            null,
            currentUri,
            null
        )

        if (result != null) {
            EclSettings.getInstance().state.snomedVersion = result
            onComplete()
        }
    }
}
