// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

package au.csiro.ecl.eclipse;

import org.eclipse.jface.preference.BooleanFieldEditor;
import org.eclipse.jface.preference.ComboFieldEditor;
import org.eclipse.jface.preference.FieldEditorPreferencePage;
import org.eclipse.jface.preference.FileFieldEditor;
import org.eclipse.jface.preference.IntegerFieldEditor;
import org.eclipse.jface.preference.StringFieldEditor;
import org.eclipse.swt.SWT;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.Group;
import org.eclipse.ui.IWorkbench;
import org.eclipse.ui.IWorkbenchPreferencePage;

/**
 * Preferences page for configuring the ECL Language Server.
 *
 * <p>Settings are organized into groups matching the IntelliJ plugin:
 * <ul>
 *   <li>Server — Node.js path (optional)</li>
 *   <li>FHIR Terminology — server URL, timeout, SNOMED version, semantic validation</li>
 *   <li>Evaluation — result limit</li>
 *   <li>Formatting — indent, line length, alignment, line breaking</li>
 * </ul>
 */
public class EclPreferencePage extends FieldEditorPreferencePage
        implements IWorkbenchPreferencePage {

    // Server
    public static final String PREF_NODE_PATH = "ecl.nodePath";

    // FHIR Terminology
    public static final String PREF_FHIR_URL = "ecl.fhirUrl";
    public static final String PREF_TIMEOUT = "ecl.timeout";
    public static final String PREF_SNOMED_VERSION = "ecl.snomedVersion";
    public static final String PREF_SEMANTIC_VALIDATION = "ecl.semanticValidation";

    // Evaluation
    public static final String PREF_RESULT_LIMIT = "ecl.resultLimit";

    // Formatting
    public static final String PREF_INDENT_SIZE = "ecl.formatting.indentSize";
    public static final String PREF_INDENT_STYLE = "ecl.formatting.indentStyle";
    public static final String PREF_SPACE_AROUND_OPERATORS = "ecl.formatting.spaceAroundOperators";
    public static final String PREF_MAX_LINE_LENGTH = "ecl.formatting.maxLineLength";
    public static final String PREF_ALIGN_TERMS = "ecl.formatting.alignTerms";
    public static final String PREF_WRAP_COMMENTS = "ecl.formatting.wrapComments";
    public static final String PREF_BREAK_ON_OPERATORS = "ecl.formatting.breakOnOperators";
    public static final String PREF_BREAK_ON_REFINEMENT_COMMA = "ecl.formatting.breakOnRefinementComma";
    public static final String PREF_BREAK_AFTER_COLON = "ecl.formatting.breakAfterColon";

    public EclPreferencePage() {
        super(GRID);
        setDescription("Configure the ECL Language Server for SNOMED CT expression editing.");
    }

    @Override
    public void init(IWorkbench workbench) {
        setPreferenceStore(EclPlugin.getDefault().getPreferenceStore());
    }

    @Override
    protected void createFieldEditors() {
        // --- Server group ---
        Group serverGroup = createGroup("Server");
        addField(new FileFieldEditor(PREF_NODE_PATH,
                "Node.js executable (leave empty to use PATH):",
                serverGroup));

        // --- FHIR Terminology group ---
        Group fhirGroup = createGroup("FHIR Terminology Server");
        addField(new StringFieldEditor(PREF_FHIR_URL,
                "Server URL:", fhirGroup));

        IntegerFieldEditor timeoutField = new IntegerFieldEditor(PREF_TIMEOUT,
                "Timeout (ms):", fhirGroup);
        timeoutField.setValidRange(500, 30000);
        addField(timeoutField);

        addField(new StringFieldEditor(PREF_SNOMED_VERSION,
                "SNOMED CT version URI:", fhirGroup));

        addField(new BooleanFieldEditor(PREF_SEMANTIC_VALIDATION,
                "Enable semantic validation (inactive/unknown concept checks)",
                fhirGroup));

        // --- Evaluation group ---
        Group evalGroup = createGroup("Evaluation");
        IntegerFieldEditor resultLimitField = new IntegerFieldEditor(PREF_RESULT_LIMIT,
                "Maximum results:", evalGroup);
        resultLimitField.setValidRange(1, 10000);
        addField(resultLimitField);

        // --- Formatting group ---
        Group fmtGroup = createGroup("Formatting");

        IntegerFieldEditor indentSizeField = new IntegerFieldEditor(PREF_INDENT_SIZE,
                "Indent size:", fmtGroup);
        indentSizeField.setValidRange(1, 8);
        addField(indentSizeField);

        addField(new ComboFieldEditor(PREF_INDENT_STYLE,
                "Indent style:", new String[][]{
                        {"Space", "space"},
                        {"Tab", "tab"}
                }, fmtGroup));

        IntegerFieldEditor maxLineLengthField = new IntegerFieldEditor(PREF_MAX_LINE_LENGTH,
                "Max line length (0 = unlimited):", fmtGroup);
        maxLineLengthField.setValidRange(0, 500);
        addField(maxLineLengthField);

        addField(new BooleanFieldEditor(PREF_SPACE_AROUND_OPERATORS,
                "Space around operators", fmtGroup));
        addField(new BooleanFieldEditor(PREF_ALIGN_TERMS,
                "Align display terms", fmtGroup));
        addField(new BooleanFieldEditor(PREF_WRAP_COMMENTS,
                "Wrap comments", fmtGroup));
        addField(new BooleanFieldEditor(PREF_BREAK_ON_OPERATORS,
                "Break on operators (AND/OR/MINUS)", fmtGroup));
        addField(new BooleanFieldEditor(PREF_BREAK_ON_REFINEMENT_COMMA,
                "Break on refinement comma", fmtGroup));
        addField(new BooleanFieldEditor(PREF_BREAK_AFTER_COLON,
                "Break after colon", fmtGroup));
    }

    private Group createGroup(String label) {
        Group group = new Group(getFieldEditorParent(), SWT.NONE);
        group.setText(label);
        GridLayout layout = new GridLayout();
        layout.numColumns = 2;
        group.setLayout(layout);
        GridData gd = new GridData(GridData.FILL_HORIZONTAL);
        gd.horizontalSpan = 2;
        group.setLayoutData(gd);
        return group;
    }
}
