// ─── Embedded ECL in FSH ─────────────────────────────────────────────────────
// Open this file and try:
//   • Hover over concept IDs (e.g. 404684003) → shows FSN, PT, active status
//   • Hover over operators (<< < >) → shows operator documentation
//   • Ctrl+Space inside a quoted ECL expression → completion suggestions
//   • Intentional errors below should show red squiggles

Alias: SCT = http://snomed.info/sct

// ── Valid ECL expressions (should show NO diagnostics) ───────────────────────

ValueSet: ClinicalFindingsVS
Id: clinical-findings-vs
Title: "Clinical Findings"
Description: "All clinical findings including descendants"
* codes from system SCT where constraint = "<< 404684003 |Clinical finding|"

ValueSet: ProceduresVS
Id: procedures-vs
Title: "Procedures"
* codes from system SCT where constraint = "<< 71388002 |Procedure|"

ValueSet: BodyStructuresVS
Id: body-structures-vs
Title: "Body Structures"
* codes from system SCT where constraint = "<< 123037004 |Body structure|"

ValueSet: MedicinalProductsVS
Id: medicinal-products-vs
Title: "Medicinal Products"
* codes from system SCT where constraint = "<< 763158003 |Medicinal product|"

ValueSet: RefinedClinicalFindingsVS
Id: refined-clinical-findings-vs
Title: "Refined Clinical Findings"
Description: "Clinical findings with a specific finding site"
* codes from system SCT where constraint = "<< 404684003 : 363698007 = << 39057004"

ValueSet: DiseasesVS
Id: diseases-vs
Title: "Diseases"
* codes from system SCT where constraint = "<< 64572001 |Disease|"

ValueSet: MemberOfRefsetVS
Id: member-of-refset-vs
Title: "Member Of Refset"
* codes from system SCT where constraint = "^ 816080008 |International Patient Summary|"

// ── ECL with intentional syntax errors (should show RED squiggles) ───────────

ValueSet: ErrorDuplicateOperatorVS
Id: error-duplicate-operator
Title: "Error: Duplicate Operator"
* codes from system SCT where constraint = "<< AND << 404684003"

ValueSet: ErrorMissingOperandVS
Id: error-missing-operand
Title: "Error: Missing Operand"
* codes from system SCT where constraint = "<< 404684003 AND"

ValueSet: ErrorInvalidSyntaxVS
Id: error-invalid-syntax
Title: "Error: Invalid Syntax"
* codes from system SCT where constraint = "<<< 404684003"
