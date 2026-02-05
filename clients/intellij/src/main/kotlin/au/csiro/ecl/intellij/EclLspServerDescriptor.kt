// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.Lsp4jClient
import com.intellij.platform.lsp.api.LspServerNotificationsHandler
import com.intellij.platform.lsp.api.ProjectWideLspServerDescriptor
import org.eclipse.lsp4j.ConfigurationItem
import org.eclipse.lsp4j.services.LanguageServer
import java.nio.file.Path

class EclLspServerDescriptor(project: Project) :
    ProjectWideLspServerDescriptor(project, "ECL Language Server") {

    override fun isSupportedFile(file: VirtualFile): Boolean {
        return file.extension == "ecl"
    }

    override fun createCommandLine(): GeneralCommandLine {
        val bundledServer = findBundledServer()
        return if (bundledServer != null) {
            GeneralCommandLine("node", bundledServer.toString(), "--stdio").apply {
                withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
            }
        } else {
            GeneralCommandLine("ecl-lsp-server", "--stdio").apply {
                withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
            }
        }
    }

    private fun findBundledServer(): Path? {
        val pluginPath = PluginManagerCore.getPlugin(PluginId.getId("au.csiro.ecl.intellij"))
            ?.pluginPath ?: return null
        val serverJs = pluginPath.resolve("ecl-lsp-server/dist/server.js")
        return if (serverJs.toFile().exists()) serverJs else null
    }

    override fun getWorkspaceConfiguration(item: ConfigurationItem): Any? {
        val settings = EclSettings.getInstance()
        return when (item.section) {
            "ecl.terminology" -> mapOf(
                "serverUrl" to settings.state.serverUrl,
                "timeout" to settings.state.timeout,
                "snomedVersion" to settings.state.snomedVersion,
            )
            "ecl.formatting" -> mapOf(
                "indentSize" to settings.state.indentSize,
                "indentStyle" to settings.state.indentStyle,
                "spaceAroundOperators" to settings.state.spaceAroundOperators,
                "maxLineLength" to settings.state.maxLineLength,
                "alignTerms" to settings.state.alignTerms,
                "wrapComments" to settings.state.wrapComments,
                "breakOnOperators" to settings.state.breakOnOperators,
                "breakOnRefinementComma" to settings.state.breakOnRefinementComma,
                "breakAfterColon" to settings.state.breakAfterColon,
            )
            "ecl.evaluation" -> mapOf(
                "resultLimit" to settings.state.resultLimit,
            )
            "ecl.semanticValidation" -> mapOf(
                "enabled" to settings.state.semanticValidationEnabled,
            )
            else -> null
        }
    }

    override val lsp4jServerClass: Class<out LanguageServer>
        get() = EclLanguageServer::class.java

    override fun createLsp4jClient(handler: LspServerNotificationsHandler): Lsp4jClient {
        return EclLsp4jClient(handler)
    }
}
