// Test 1: Basic Formatting
// Before formatting, this should have inconsistent spacing

// Constraint operators with extra spaces
<<  404684003|Clinical finding|

/* ECL-END */

// Logical operators without spaces
<404684003OR<19829001

/* ECL-END */

// Multiple spaces around operators
<404684003  OR  <19829001  AND  <234567890

/* ECL-END */

// Terms without proper spacing
404684003|Clinical   finding|

/* ECL-END */

// Concept ID with multiple spaces before term
404684003   |Clinical finding|

/* ECL-END */

// Mixed spacing issues
<<404684003  |  Clinical   finding  |OR<19829001|Disorder|

/* ECL-END */
