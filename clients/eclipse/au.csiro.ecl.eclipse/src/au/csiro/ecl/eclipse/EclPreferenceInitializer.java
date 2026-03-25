// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.eclipse;

import org.eclipse.core.runtime.preferences.AbstractPreferenceInitializer;
import org.eclipse.jface.preference.IPreferenceStore;

/**
 * Initializes default preference values for the ECL Language Server plugin.
 * Defaults match the IntelliJ plugin configuration.
 */
public class EclPreferenceInitializer extends AbstractPreferenceInitializer {

    @Override
    public void initializeDefaultPreferences() {
        IPreferenceStore store = EclPlugin.getDefault().getPreferenceStore();

        // Server
        store.setDefault(EclPreferencePage.PREF_NODE_PATH, "");

        // FHIR Terminology
        store.setDefault(EclPreferencePage.PREF_FHIR_URL,
                "https://tx.ontoserver.csiro.au/fhir");
        store.setDefault(EclPreferencePage.PREF_TIMEOUT, 2000);
        store.setDefault(EclPreferencePage.PREF_SNOMED_VERSION, "");
        store.setDefault(EclPreferencePage.PREF_SEMANTIC_VALIDATION, true);

        // Evaluation
        store.setDefault(EclPreferencePage.PREF_RESULT_LIMIT, 200);

        // Formatting
        store.setDefault(EclPreferencePage.PREF_INDENT_SIZE, 2);
        store.setDefault(EclPreferencePage.PREF_INDENT_STYLE, "space");
        store.setDefault(EclPreferencePage.PREF_SPACE_AROUND_OPERATORS, true);
        store.setDefault(EclPreferencePage.PREF_MAX_LINE_LENGTH, 80);
        store.setDefault(EclPreferencePage.PREF_ALIGN_TERMS, true);
        store.setDefault(EclPreferencePage.PREF_WRAP_COMMENTS, false);
        store.setDefault(EclPreferencePage.PREF_BREAK_ON_OPERATORS, false);
        store.setDefault(EclPreferencePage.PREF_BREAK_ON_REFINEMENT_COMMA, false);
        store.setDefault(EclPreferencePage.PREF_BREAK_AFTER_COLON, false);
    }
}
