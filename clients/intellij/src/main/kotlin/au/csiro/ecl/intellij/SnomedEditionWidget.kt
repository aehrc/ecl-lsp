// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.util.Consumer
import java.awt.Component
import java.awt.event.MouseEvent

class SnomedEditionWidget(private val project: Project) :
    StatusBarWidget,
    StatusBarWidget.TextPresentation {

    companion object {
        const val ID = "ecl.snomedEdition"
    }

    private var statusBar: StatusBar? = null
    private var resolvedVersionUri: String? = null
    private var eclFileActive: Boolean = false

    override fun ID(): String = ID

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar

        // Check if an ECL file is currently active
        eclFileActive = isEclFileActive

        // Listen for file editor changes to show/hide widget
        project.messageBus.connect(this).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
                    updateVisibility()
                }

                override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
                    updateVisibility()
                }

                override fun selectionChanged(event: FileEditorManagerEvent) {
                    updateVisibility()
                }
            }
        )

        // Listen for resolved SNOMED version notifications from the LSP server
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            EclSnomedVersionListener.TOPIC,
            EclSnomedVersionListener { versionUri ->
                resolvedVersionUri = versionUri
                updateWidget()
            }
        )
    }

    override fun dispose() {
        statusBar = null
    }

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun getText(): String {
        if (!eclFileActive) return ""
        return buildDisplayText()
    }

    override fun getTooltipText(): String = "SNOMED CT Edition/Version (click to change)"

    override fun getAlignment(): Float = Component.RIGHT_ALIGNMENT

    override fun getClickConsumer(): Consumer<MouseEvent>? = Consumer { _ ->
        SnomedEditionPicker.show(project, statusBar?.component) {
            // After picker completes, refresh display
            resolvedVersionUri = null
            updateWidget()
        }
    }

    private val isEclFileActive: Boolean
        get() {
            val selectedFile = FileEditorManager.getInstance(project).selectedFiles.firstOrNull()
            return selectedFile?.extension == "ecl"
        }

    private fun updateVisibility() {
        eclFileActive = isEclFileActive
        updateWidget()
    }

    private fun updateWidget() {
        ApplicationManager.getApplication().invokeLater {
            statusBar?.updateWidget(ID)
        }
    }

    private fun buildDisplayText(): String {
        val settingUri = EclSettings.getInstance().state.snomedVersion ?: ""

        if (settingUri.isEmpty()) {
            return buildDefaultDisplayText()
        }

        val parsed = parseSnomedVersionUri(settingUri)
            ?: return "SNOMED CT: $settingUri"

        val label = getEditionLabel(parsed.first)
        val configuredDate = parsed.second

        if (configuredDate != null) {
            return "SNOMED CT: $label ${formatSnomedDate(configuredDate)}"
        }

        return buildLatestDisplayText(label)
    }

    private fun buildDefaultDisplayText(): String {
        val resolved = resolvedVersionUri
        if (resolved.isNullOrEmpty()) return "SNOMED CT: (Default)"

        val parsed = parseSnomedVersionUri(resolved) ?: return "SNOMED CT: (Default)"
        val label = getEditionLabel(parsed.first)
        val date = parsed.second
        return if (date != null) {
            "SNOMED CT: $label ${formatSnomedDate(date)} (default)"
        } else {
            "SNOMED CT: $label (default)"
        }
    }

    private fun buildLatestDisplayText(label: String): String {
        val resolved = resolvedVersionUri
        if (!resolved.isNullOrEmpty()) {
            val resolvedParsed = parseSnomedVersionUri(resolved)
            if (resolvedParsed?.second != null) {
                return "SNOMED CT: $label ${formatSnomedDate(resolvedParsed.second!!)} (latest)"
            }
        }
        return "SNOMED CT: $label (latest)"
    }
}
