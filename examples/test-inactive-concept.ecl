// Example ECL expressions for testing inactive concept detection

// Active concept - should have no warnings
< 404684003 |Clinical finding|

/* ECL-END */

// Inactive concept - should show warning
< 123456001 |Inactive test concept|

/* ECL-END */

// Mixed - one active, one inactive
< 404684003 |Clinical finding| AND < 123456001 |Inactive|

/* ECL-END */

// Multiple active concepts
< 19829001 |Disorder of lung| OR < 301867009 |Edema of trunk|

/* ECL-END */

// Complex refinement with multiple concepts
< 404684003 |Clinical finding| : 363698007 |Finding site| = < 39057004 |Pulmonary valve structure|
