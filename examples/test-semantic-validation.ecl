// Semantic Validation Manual Tests
// Requires a live FHIR terminology server (ecl.semanticValidation.enabled = true)

// 11.2 — Valid refinement: NO warnings expected
< 404684003 |Clinical finding| : 363698007 |Finding site| = < 39057004 |Pulmonary valve structure|

/* ECL-END */

// 11.3 — Invalid attribute (not a linkage concept): WARNING on attribute
< 404684003 |Clinical finding| : 22298006 |Myocardial infarction| = < 39057004 |Pulmonary valve structure|

/* ECL-END */

// 11.4 — Disjoint value constraint: WARNING on value ("no concepts in common")
< 404684003 |Clinical finding| : 363698007 |Finding site| = < 387713003 |Surgical procedure|

/* ECL-END */

// 11.5 — Multi-attribute with one impossible refinement: WARNING on second pair
< 404684003 |Clinical finding| : 363698007 |Finding site| = < 39057004 |Pulmonary valve structure|, 116676008 |Associated morphology| = < 69695003 |Stapling|
