// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

import org.eclipse.lsp4j.jsonrpc.services.JsonRequest
import org.eclipse.lsp4j.services.LanguageServer
import java.util.concurrent.CompletableFuture

interface EclLanguageServer : LanguageServer {
    @JsonRequest("ecl/getSnomedEditions")
    fun getSnomedEditions(): CompletableFuture<SnomedEditionsResponse>

    @JsonRequest("ecl/searchConcept")
    fun searchConcept(params: ConceptSearchParams): CompletableFuture<ConceptSearchResponse>
}

data class SnomedEditionsResponse(
    val editions: List<SnomedEdition> = emptyList()
)

data class SnomedEdition(
    val moduleId: String = "",
    val versions: List<SnomedVersion> = emptyList()
)

data class SnomedVersion(
    val uri: String = "",
    val date: String = ""
)

data class ConceptSearchParams(
    val query: String = ""
)

data class ConceptSearchResponse(
    val results: List<ConceptSearchResult> = emptyList(),
    val hasMore: Boolean = false
)

data class ConceptSearchResult(
    val id: String = "",
    val fsn: String = "",
    val pt: String = ""
)
