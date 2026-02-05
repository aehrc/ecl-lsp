// Test 4: Term Alignment
// Multi-attribute refinements should align | characters vertically

// Multi-attribute with different term lengths (should align)
< 404684003 |Clinical finding|:
363698007 |Site| = < 39057004 |Pulmonary valve|,
116676008 |Associated morphology| = < 72704001 |Fracture|,
246075003 |Causative agent| = < 387517004 |Paracetamol|

/* ECL-END */

// Another multi-attribute example
< 404684003:
363698007 = < 39057004 |Short|,
116676008 = < 72704001 |Very long morphology term here|,
246075003 = < 387517004 |Medium term|

/* ECL-END */

// Single attribute (should NOT have extra alignment spacing)
< 404684003 |Clinical finding|: 363698007 |Finding site| = < 39057004 |Pulmonary valve|

/* ECL-END */

// Block format with alignment
< 404684003 : {
363698007 |Site| = < 39057004 |Pulmonary|,
116676008 |Morphology| = < 72704001 |Fracture|
}

/* ECL-END */
