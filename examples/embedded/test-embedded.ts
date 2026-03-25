// ─── Embedded ECL in TypeScript (comment trigger) ────────────────────────────
// Place `// ecl` or `/* ecl */` on the line IMMEDIATELY before a string literal.
// Supports double-quoted, single-quoted, and backtick template literals.

// ── Valid expressions ────────────────────────────────────────────────────────

// ecl
const clinicalFindings = '<< 404684003 |Clinical finding|';

// ecl
const procedures = '<< 71388002 |Procedure|';

// ecl
const bodyStructures = `<< 123037004 |Body structure|`;

/* ecl */
const refined = '<< 404684003 : 363698007 = << 39057004';

// ecl
const compound = '<< 404684003 OR << 71388002';

// ecl
const memberOf = '^ 816080008 |International Patient Summary|';

// ── Expressions with errors (should show red squiggles) ──────────────────────

// ecl
const duplicateOp = '<< AND << 404684003';

// ecl
const incomplete = '<< 404684003 AND';

// ── NOT ECL (no comment trigger) ─────────────────────────────────────────────

const notEcl = '<< 404684003 |Clinical finding|';
