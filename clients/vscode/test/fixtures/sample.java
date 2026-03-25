// Sample Java file demonstrating embedded ECL support via comment trigger.
//
// When `// ecl` or `/* ecl */` appears on the line immediately before a
// string literal, the string content is treated as ECL.
//
// Both syntax highlighting (Layer 1) and full LSP features (Layer 2) are active:
//   - Completions: Place cursor inside the string and trigger (Ctrl+Space)
//   - Diagnostics: Syntax errors show as red squiggles
//   - Hover: Hover over operators or concept IDs for documentation

public class EclExample {

    // ecl
    String clinicalFindings = "<< 404684003 |Clinical finding|";

    // ecl
    String procedures = "<< 71388002 |Procedure|";

    /* ecl */
    String refined = "<< 404684003 : 363698007 = << 39057004";

    // This string is NOT treated as ECL (no comment trigger):
    String notEcl = "<< 404684003";
}
