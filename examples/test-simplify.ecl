// ===========================================
// REFACTORING — MANUAL TEST EXAMPLES
// ===========================================
// Open this file in VSCode with the ECL extension.
// Place cursor on each expression and open the code action menu (Ctrl+. / Cmd+.)
// to see the available refactoring actions. Select one to apply.

// =====================
// UNIFIED SIMPLIFY
// =====================

// ----- Technique 1: Remove exact duplicates -----
// (Uses concepts from different hierarchies to avoid FHIR subsumption cascading)

// Duplicate operand in AND — should simplify to: < 363698007 AND < 39057004
< 363698007 AND < 39057004 AND < 363698007

/* ECL-END */

// Duplicate operand in OR — should simplify to: < 363698007 OR < 39057004
< 363698007 OR < 39057004 OR < 363698007

/* ECL-END */

// ----- Technique 2: Same-concept operator ranking -----

// AND keeps more restrictive — should simplify to: < 404684003
<< 404684003 AND < 404684003

/* ECL-END */

// AND keeps self (most restrictive) — should simplify to: 404684003
<< 404684003 AND 404684003

/* ECL-END */

// OR keeps broader — should simplify to: << 404684003
<< 404684003 OR < 404684003

/* ECL-END */

// OR keeps descendantOf over self — should simplify to: < 404684003
< 404684003 OR 404684003

/* ECL-END */

// ----- Technique 3: Factor common focus (OR) -----

// Same focus in OR refinements — should factor to:
//   < 404684003 : 363698007 = < 39057004 OR 116676008 = < 72651009
(< 404684003 : 363698007 = < 39057004) OR (< 404684003 : 116676008 = < 72651009)

/* ECL-END */

// ----- Technique 4: Merge same-focus refinements (AND) -----

// Same focus in AND refinements — should merge to:
//   < 404684003 : 363698007 = < 39057004, 116676008 = < 72651009
(< 404684003 : 363698007 = < 39057004) AND (< 404684003 : 116676008 = < 72651009)

/* ECL-END */

// ----- Technique 5: FHIR subsumption via MINUS -----
// (Requires live FHIR connection to tx.ontoserver.csiro.au)

// AND: 19829001 (Disorder of lung) is a subset of 404684003 (Clinical finding)
// Should simplify to: < 19829001
< 404684003 AND < 19829001

/* ECL-END */

// OR: keeps the broader set
// Should simplify to: < 404684003
< 404684003 OR < 19829001

/* ECL-END */

// ----- Bottom-up nesting -----
// (Uses concepts from different hierarchies to isolate the inner simplification)

// Inner OR groups simplify first via ranking, then outer AND remains
// Inner: << 363698007 OR < 363698007 → << 363698007
// Inner: << 39057004 OR < 39057004 → << 39057004
// Result: << 363698007 AND << 39057004
(<< 363698007 OR < 363698007) AND (<< 39057004 OR < 39057004)

/* ECL-END */

// ----- Re-check cascade -----

// Duplicate removal → then operator ranking
// Step 1: dedup → < 404684003 OR << 404684003
// Step 2: ranking → << 404684003
< 404684003 OR << 404684003 OR < 404684003

/* ECL-END */

// ----- No simplification available -----

// Different hierarchies, no subsumption — "Simplify" action is offered
// but returns no edit (action resolves to no change)
< 363698007 AND < 39057004

/* ECL-END */

// MINUS expressions are never simplified — no "Simplify" action offered
< 404684003 MINUS < 19829001

/* ECL-END */

// Single concept — no "Simplify" action offered
< 404684003

/* ECL-END */

// =====================
// ADD EXPLICIT PARENTHESES
// =====================

// ----- Case 1: Mixed operators (AND/OR/MINUS) -----

// AND/OR mix — should add parens: (< 404684003 AND < 19829001) OR < 301867009
< 404684003 AND < 19829001 OR < 301867009

/* ECL-END */

// AND/MINUS mix — should add parens: (< 404684003 AND < 19829001) MINUS < 301867009
< 404684003 AND < 19829001 MINUS < 301867009

/* ECL-END */

// OR/MINUS mix — should add parens: (< 404684003 OR < 19829001) MINUS < 301867009
< 404684003 OR < 19829001 MINUS < 301867009

/* ECL-END */

// ----- Case 2: Refinement ambiguity -----
// Multiple refined sub-expressions without brackets need parens to disambiguate

// Two refined sub-expressions with AND — should add parens:
//   (< 404684003 : 363698007 = < 39057004) AND (< 19829001 : 116676008 = < 72651009)
< 404684003 : 363698007 = < 39057004 AND < 19829001 : 116676008 = < 72651009

/* ECL-END */

// Two refined sub-expressions with OR — should add parens:
//   (< 404684003 : 363698007 = < 39057004) OR (< 19829001 : 116676008 = < 72651009)
< 404684003 : 363698007 = < 39057004 OR < 19829001 : 116676008 = < 72651009

/* ECL-END */

// Three refined sub-expressions — should add parens around each:
//   (< 404684003 : 363698007 = < 39057004) AND (< 19829001 : 116676008 = < 72651009) AND (< 73211009 : 363698007 = < 39057004)
< 404684003 : 363698007 = < 39057004 AND < 19829001 : 116676008 = < 72651009 AND < 73211009 : 363698007 = < 39057004

/* ECL-END */

// ----- Not offered -----

// Single colon (refinement-internal AND) — no ambiguity, no action offered
< 404684003 : 363698007 = < 39057004 AND 116676008 = < 72651009

/* ECL-END */

// Already parenthesised — no ambiguity, no action offered
(< 404684003 : 363698007 = < 39057004) AND (< 19829001 : 116676008 = < 72651009)

/* ECL-END */

// Single operator type — no action offered
< 404684003 AND < 19829001

/* ECL-END */

// MINUS only — no action offered
< 404684003 MINUS < 19829001
