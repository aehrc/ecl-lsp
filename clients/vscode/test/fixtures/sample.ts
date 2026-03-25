// Sample TypeScript file demonstrating embedded ECL support via comment trigger.
//
// When `// ecl` or `/* ecl */` appears on the line immediately before a
// string literal, the string content is treated as ECL.
//
// Supports double-quoted, single-quoted, and backtick template literals.
//
// Both syntax highlighting (Layer 1) and full LSP features (Layer 2) are active:
//   - Completions: Place cursor inside the string and trigger (Ctrl+Space)
//   - Diagnostics: Syntax errors show as red squiggles
//   - Hover: Hover over operators or concept IDs for documentation

// ecl
const clinicalFindings = '<< 404684003 |Clinical finding|';

// ecl
const procedures = '<< 71388002 |Procedure|';

// ecl
const refined = `<< 404684003 : 363698007 = << 39057004`;

/* ecl */
const bodyStructures = '<< 123037004 |Body structure|';

// This string is NOT treated as ECL (no comment trigger):
const notEcl = '<< 404684003';
