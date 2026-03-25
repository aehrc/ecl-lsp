// Test 6: Multi-Expression Files
// Each expression separated by /* ECL-END */ should be formatted independently

// First expression with bad spacing
<<  404684003  |  Clinical   finding  |

/* ECL-END */

// Second expression with different issues
<404684003OR<19829001

/* ECL-END */

// Third expression with refinement
< 404684003:363698007=<39057004

/* ECL-END */

// Fourth expression - complex
(< 404684003  |  Clinical finding  |OR< 19829001)AND<234567890

/* ECL-END */

// Fifth expression - well formatted already
<< 404684003 | Clinical finding |
