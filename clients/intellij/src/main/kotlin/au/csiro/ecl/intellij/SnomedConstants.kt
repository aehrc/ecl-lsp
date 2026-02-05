// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.intellij

val MODULE_TO_COUNTRY = mapOf(
    "900000000000207008" to "International",
    "32506021000036107" to "Australian",
    "731000124108" to "US",
    "999000011000000103" to "UK Clinical",
    "999000021000000109" to "UK Drug",
    "83821000000107" to "UK Composition",
    "11000172109" to "Belgian",
    "21000210109" to "Danish",
    "554471000005108" to "Danish",
    "11000146104" to "Dutch",
    "11000181102" to "Estonian",
    "11000229109" to "Irish",
    "11000220105" to "Uruguayan",
    "5631000179106" to "Uruguayan",
    "45991000052106" to "Swedish",
    "11000221109" to "Argentinian",
    "20611000087101" to "Canadian",
    "11000274103" to "German",
    "51000202101" to "Norwegian",
    "11000234105" to "Austrian",
    "2011000195101" to "Swiss",
    "11000315107" to "French",
    "900000001000122104" to "Spanish",
    "450829007" to "Spanish (Latin America)",
    "11000318109" to "Jamaican",
    "332351000009108" to "Veterinary (VTSL)",
    "11010000107" to "LOINC Extension",
    "999991001000101" to "IPS Terminology",
)

fun parseSnomedVersionUri(uri: String): Pair<String, String?>? {
    val pinned = Regex("""^http://snomed\.info/sct/(\d+)/version/(\d+)$""").find(uri)
    if (pinned != null) return Pair(pinned.groupValues[1], pinned.groupValues[2])
    val editionOnly = Regex("""^http://snomed\.info/sct/(\d+)$""").find(uri)
    if (editionOnly != null) return Pair(editionOnly.groupValues[1], null)
    return null
}

fun getEditionLabel(moduleId: String): String {
    return MODULE_TO_COUNTRY[moduleId] ?: moduleId
}

fun formatSnomedDate(yyyymmdd: String): String {
    if (yyyymmdd.length != 8) return yyyymmdd
    return "${yyyymmdd.substring(0, 4)}-${yyyymmdd.substring(4, 6)}-${yyyymmdd.substring(6, 8)}"
}
