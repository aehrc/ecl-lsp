// Test 3: Line Breaking
// Long lines should break at logical operators when exceeding maxLineLength (default 80)

// Very long expression (should break into multiple lines)
< 404684003 |Clinical finding| OR < 19829001 |Disorder of lung| OR < 234567890 |Another disorder| OR < 345678901 |Yet another finding| OR < 456789012 |One more concept|

/* ECL-END */

// Long expression with AND (should break at AND operators)
< 404684003 |Clinical finding| AND < 19829001 |Disorder of lung| AND < 234567890 |Another disorder| AND < 345678901 |Yet another finding|

/* ECL-END */

// Expression with long terms (terms should not break mid-word)
< 404684003 |This is a very long clinical finding term that exceeds the maximum line length but should not be broken|

/* ECL-END */

// Mixed operators (should break at appropriate points)
(< 404684003 |Clinical finding| OR < 19829001 |Disorder|) AND (< 234567890 |Finding| OR < 345678901 |Morphology|) MINUS < 456789012 |Exclusion|

/* ECL-END */
