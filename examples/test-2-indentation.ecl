// Test 2: Indentation
// Should indent content inside braces

// Simple refinement block (should indent content)
< 404684003 |Clinical finding| {
363698007 |Finding site| = < 39057004 |Pulmonary valve structure|,
116676008 |Associated morphology| = < 72704001 |Fracture|
}

/* ECL-END */

// Nested refinement blocks (should have nested indentation)
< 404684003 {
363698007 = < 39057004 {
116676008 = < 72704001
}
}

/* ECL-END */

// Multiple attributes without braces (should not indent)
< 404684003 |Clinical finding|:
363698007 |Finding site| = < 39057004 |Pulmonary valve structure|,
116676008 |Associated morphology| = < 72704001 |Fracture|

/* ECL-END */
