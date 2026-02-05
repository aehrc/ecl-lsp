// ===========================================
// MANUAL TEST FILE FOR NEW FEATURES
// ===========================================

// TEST 1: Active concept - should have NO warnings
// Expected: Green, no squiggles
< 404684003 |Clinical finding|

/* ECL-END */

// TEST 2: Inactive concept - should show WARNING
// Expected: Yellow squiggle under the concept ID
// Hover: Should show ⚠️ INACTIVE
< 123456001 |Inactive test concept|

/* ECL-END */

// TEST 3: Multiple concepts - only inactive one warns
// Expected: Yellow squiggle only under 123456001
< 404684003 |Clinical finding| AND < 123456001 |Inactive|

/* ECL-END */

// TEST 4: All active concepts - no warnings
// Expected: Green, no squiggles
< 19829001 |Disorder of lung| OR < 301867009 |Edema of trunk|

/* ECL-END */

// TEST 5: Concept hover on active concept
// Hover over 404684003 below
// Expected hover card:
//   - **Clinical finding (finding)**
//   - **Preferred Term:** Clinical finding
//   - **Concept ID:** 404684003
//   - **Status:** ✓ Active
< 404684003

/* ECL-END */

// TEST 6: Concept hover on inactive concept
// Hover over 123456001 below
// Expected hover card:
//   - **Inactive test concept (finding)**
//   - **Status:** ⚠️ INACTIVE
< 123456001

/* ECL-END */

// TEST 7: Operator hover still works
// Hover over the AND below
// Expected: Shows "Logical AND" documentation
< 404684003 AND < 19829001

/* ECL-END */

// TEST 8: Complex expression with refinement
// Expected: Warning on 123456001 if it appears in refinement
< 404684003 : 363698007 = < 123456001

/* ECL-END */

// TEST 9: Syntax error + inactive concept
// Expected: Both red squiggle (syntax) AND yellow squiggle (inactive)
< 404684003 AND AND < 123456001

/* ECL-END */

// TEST 10: Unknown concept (not in mock service)
// Expected: No warning (graceful handling)
< 999999999 |Unknown concept|
