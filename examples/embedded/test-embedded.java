// ─── Embedded ECL in Java (comment trigger) ─────────────────────────────────
// Place `// ecl` or `/* ecl */` on the line IMMEDIATELY before a string literal
// to activate ECL support. Try: hover, completions (Ctrl+Space), diagnostics.

public class EclEmbeddedTest {

    // ── Valid expressions ────────────────────────────────────────────────────

    // ecl
    String clinicalFindings = "<< 404684003 |Clinical finding|";

    // ecl
    String procedures = "<< 71388002 |Procedure|";

    // ecl
    String bodyStructures = "<< 123037004 |Body structure|";

    /* ecl */
    String refined = "<< 404684003 : 363698007 = << 39057004";

    // ecl
    String compound = "<< 404684003 OR << 71388002";

    // ecl
    String memberOf = "^ 816080008 |International Patient Summary|";

    // ── Expressions with errors (should show red squiggles) ──────────────────

    // ecl
    String duplicateOp = "<< AND << 404684003";

    // ecl
    String incomplete = "<< 404684003 AND";

    // ecl
    String tripleAngle = "<<< 404684003";

    // ── NOT ECL (no comment trigger — these should NOT show ECL diagnostics) ─

    String notEcl1 = "<< 404684003 |Clinical finding|";
    String notEcl2 = "This is just a regular string";

    // A normal comment (not ecl trigger)
    String notEcl3 = "<< 71388002";
}
