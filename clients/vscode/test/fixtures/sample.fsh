// Sample FSH file demonstrating embedded ECL support
//
// Both syntax highlighting (Layer 1) and full LSP features (Layer 2)
// are active within the ECL expressions below:
//
//   - Completions: Place cursor inside a quoted ECL expression and
//     trigger completion (Ctrl+Space) for operators, concepts, etc.
//   - Diagnostics: Syntax errors in ECL expressions show as red squiggles
//     (e.g. duplicate operators, missing operands)
//   - Hover: Hover over ECL constraint operators (< << >) or concept IDs
//     for documentation and concept information

Alias: SCT = http://snomed.info/sct

ValueSet: ClinicalFindingsVS
Id: clinical-findings-vs
Title: "Clinical Findings Value Set"
Description: "All clinical findings including descendants"
* codes from system SCT where constraint = "<< 404684003 |Clinical finding|"

ValueSet: ProceduresVS
Id: procedures-vs
Title: "Procedures Value Set"
Description: "All procedure concepts"
* codes from system SCT where constraint = "<< 71388002 |Procedure|"

ValueSet: BodyStructuresVS
Id: body-structures-vs
Title: "Body Structures"
Description: "Anatomical body structures"
* codes from system SCT where constraint = "<< 123037004 |Body structure|"

// This line has an intentional ECL syntax error — should produce a diagnostic:
// * codes from system SCT where constraint = "<< AND << 404684003"
