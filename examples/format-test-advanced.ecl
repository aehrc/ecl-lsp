// Test file for advanced formatting features

// Test 1: Simple expression (baseline)
<<404684003|Clinical finding|

/* ECL-END */

// Test 2: Long expression that should break into multiple lines
<404684003 OR <19829001 OR <234567890 OR <345678901 OR <456789012 OR <567890123 OR <678901234

/* ECL-END */

// Test 3: Refinement with indentation
< 404684003 : 363698007 = < 39057004

/* ECL-END */

// Test 4: Multi-attribute refinement with term alignment (should align pipes)
< 404684003 :
  363698007 = < 39057004 |Finding site|,
  116676008 = < 72704001 |Fracture|

/* ECL-END */

// Test 5: Complex nested refinement
< 404684003 |Clinical finding| : {
  363698007 |Finding site| = < 39057004 |Pulmonary valve structure|,
  116676008 |Associated morphology| = < 72704001 |Fracture|
}

/* ECL-END */

// Test 6: Compound expression with AND/OR
(<404684003 OR <19829001) AND <123456789

/* ECL-END */

// Test 7: Unformatted refinement with bad spacing
<404684003:{363698007=<39057004,116676008=<72704001}
