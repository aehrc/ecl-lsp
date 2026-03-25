// Test 7: Range Formatting
// Instructions: Select ONLY the second expression and format selection

// First expression - DO NOT SELECT THIS
<<  404684003  |  Clinical   finding  |

/* ECL-END */

// Second expression - SELECT THIS ONE
<404684003  OR  <19829001  AND  <234567890

/* ECL-END */

// Third expression - DO NOT SELECT THIS
< 404684003:363698007=<39057004

// After range formatting:
// - First expression should remain unchanged (with extra spaces)
// - Second expression should be formatted (spaces normalized)
// - Third expression should remain unchanged (no spaces around operators)
