// ========================================
// MULTI-LINE ECL TEST FILE
// Tests both valid and invalid multi-line expressions
// ========================================

// SUCCESS CASE 1: Valid multi-line compound constraint
< 404684003 |Clinical finding|
  AND < 19829001 |Disorder of lung|
  AND < 301867009 |Edema of trunk|

/* ECL-END */

// SUCCESS CASE 2: Valid multi-line refinement
< 404684003 |Clinical finding| :
  363698007 |Finding site| = < 39057004 |Anatomical structure|

/* ECL-END */

// SUCCESS CASE 3: Valid multi-line with OR
< 19829001 |Disorder of lung|
  OR < 301867009 |Edema of trunk|
  OR < 195967001 |Asthma|

/* ECL-END */

// SUCCESS CASE 4: Valid multi-line with grouping
< 404684003 |Clinical finding| AND
  (< 19829001 |Disorder of lung| OR < 301867009 |Edema|)

/* ECL-END */

// FAIL CASE 1: Two constraints without logical operator
// This SHOULD show an error (missing AND/OR/MINUS)
< 404684003 |Clinical finding|
<< 19829001 |Disorder of lung|

/* ECL-END */

// FAIL CASE 2: Incomplete expression across lines
// This SHOULD show an error (AND without right operand)
< 404684003 |Clinical finding|
  AND

/* ECL-END */

// FAIL CASE 3: Missing closing parenthesis
// This SHOULD show an error
(< 404684003 |Clinical finding|
  AND < 19829001 |Disorder of lung|

/* ECL-END */

// FAIL CASE 4: Two expressions without delimiter between them
// This SHOULD show an error because both lines are treated as one invalid expression
/* First expression */
< 404684003 |Clinical finding|
/* Second expression - MISSING ECL-END ABOVE */
<< 19829001 |Disorder of lung|

/* ECL-END */

// SUCCESS CASE 5: Single-line expression (for comparison)
<< 73211009 |Diabetes mellitus|
