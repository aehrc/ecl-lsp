// First expression - multi-line compound constraint
< 404684003 |Clinical finding|
  AND < 19829001 |Disorder of lung|

/* ECL-END */

// Second expression - with refinement
< 404684003 |Clinical finding| :
  363698007 |Finding site| = < 39057004 |Anatomical structure|

/* ECL-END */

// Third expression - complex with OR
< 19829001 OR < 301867009 OR < 195967001 {{ D term = "foo" }}
/* ECL-END */

// Fourth expression - single line for comparison
<< 73211009 |Diabetes mellitus|
