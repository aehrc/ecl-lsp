// ===========================================
// REAL FHIR SERVER TEST FILE
// Using actual SNOMED CT concepts
// ===========================================

// TEST 1: Active concept - should have NO warnings
// 138875005 = SNOMED CT Concept (SNOMED RT+CTV3)
< 138875005 |SNOMED CT Concept|

/* ECL-END */

// TEST 2: INACTIVE concept - should show WARNING
// 399144008 = Swelling of back (finding) - INACTIVE
< 399144008 |Swelling of back|

/* ECL-END */

// TEST 3: Unknown/invalid concept - should show WARNING
// 123456789 = Not a valid SNOMED concept
< 123456789 |Invalid concept|

/* ECL-END */

// TEST 4: Multiple concepts - check which are active/inactive
< 138875005 |SNOMED CT Concept| AND < 399144008 |Swelling of back|

/* ECL-END */

// TEST 5: All active concepts - no warnings
< 404684003 |Clinical finding| OR < 64572001 |Disease|

/* ECL-END */

// TEST 6: Hover on active concept
// Hover over 404684003 below
// Expected: Show FSN, PT, Status: ✓ Active
< 404684003

/* ECL-END */

// TEST 7: Hover on INACTIVE concept
// Hover over 399144008 below
// Expected: Show FSN, PT, Status: ⚠️ INACTIVE
< 399144008

/* ECL-END */

// TEST 8: Hover on unknown concept
// Hover over 123456789 below
// Expected: Show "Unknown Concept" with warning message
< 123456789

/* ECL-END */

// TEST 9: Complex expression with inactive in refinement
< 404684003 : 363698007 |Finding site| = < 399144008

/* ECL-END */

// TEST 10: Operator hover still works
// Hover over AND below - should show operator docs
< 404684003 AND < 64572001
