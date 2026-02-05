// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.LspServerSupportProvider
import com.intellij.platform.lsp.api.LspServerSupportProvider.LspServerStarter

class EclLspServerSupportProvider : LspServerSupportProvider {
    private val log = Logger.getInstance(EclLspServerSupportProvider::class.java)

    override fun fileOpened(
        project: Project,
        file: VirtualFile,
        serverStarter: LspServerStarter
    ) {
        log.info("fileOpened called for: ${file.name} (extension=${file.extension})")
        if (file.extension == "ecl") {
            log.info("Starting ECL LSP server for project: ${project.name}")
            try {
                serverStarter.ensureServerStarted(EclLspServerDescriptor(project))
                log.info("ECL LSP server started successfully")
            } catch (e: Exception) {
                log.error("Failed to start ECL LSP server", e)
            }
        }
    }
}
