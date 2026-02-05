/* Example ECL expressions */

/* Simple descendant constraint */
< 404684003 |Clinical finding| OR < (763158003 |Medicinal product| : 762951001 |Has ingredient|)

/* ECL-END */

/* Descendant or self */
<< 19829001 |Disorder of lung| AND < 255475006 |Full field| : 363703001 |Has intent|

/* ECL-END */

/* Compound expression with AND */
< 404684003 |Clinical finding| AND < 19829001 |Disorder|

/* ECL-END */

/* Compound expression with OR */
< 19829001 |Disorder of lung| OR < 301867009 |Edema of trunk|

/* ECL-END */

/* Refinement */
< 404684003 |Clinical finding| : 363698007 |Finding site| = < 39057004 |Pulmonary valve structure|

/* ECL-END */

/* Complex expression with grouping */
< 19829001 |Disorder of lung| AND (< 301867009 |Edema of trunk| OR < 195967001 |Asthma|)

/* ECL-END */

/* Inactive concept (should show warning) */
< 123456001 |Inactive concept|

/* ECL-END */

/* Test cases for error diagnostics */

/* Duplicate AND - should highlight second AND */
< 404684003 AND AND < 19829001

/* ECL-END */

/* Duplicate OR - should highlight second OR */
< 404684003 OR OR < 19829001

/* ECL-END */

/* Incomplete expression - should highlight last token */
< 404684003 AND

/* ECL-END */

/* Missing operator between constraints - should highlight second < */
< 404684003 < 19829001

/* ECL-END */

/* Missing closing parenthesis - should highlight opening ( or last token */
(< 404684003

/* ECL-END */

/* Multiple errors in one line */
 763158003 |Medicinal product| : 127489000 |Has active ingredient| = < paracet

