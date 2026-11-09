// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

// Benchmark deriveEcl on a file of reference sets, optionally against reference
// ECL for the same sets (e.g. REFACTOR's intensional definitions).
//
//   node scripts/derive-benchmark.cjs --sets <tsv> [--reference <tsv>] --version <uri>
//     [--base-url <url>] [--max-size N] [--only id,id] [--no-graph] --out <jsonl>
//   node scripts/derive-benchmark.cjs --out <jsonl> --summary
//
// The TSV files use the UK DMWB export layout: a header row, tab-separated,
// latin1 (a UTF-8 byte-order mark is ignored), with the columns ID,
// DESCRIPTION and SCTRULE: in --sets an ECL OR list of the members, or a single
// code; in --reference the reference ECL. Every set is judged on the release given by
// --version, which may differ from the release the reference was made on. The
// reference is judged against the same members deriveEcl used: the given codes
// less those deriveEcl left out as inactive, unknown or malformed on that
// release. A reference that cannot be judged is recorded as
// `reference: { error }` without failing the set.
//
// Reads the compiled library in dist-tsc (run `npm run compile` first). The
// run is resumable: ids already in --out without an error are skipped. A set
// that fails is retried once after 30 s, and sets run one at a time with a
// 1.5 s pause, to stay inside public servers' rate limits.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist-tsc');
const RETRY_MS = 30_000;
const NO_CANDIDATES = 'no candidates';
const PAUSE_MS = 1500;
const TIMEOUT_MS = 120_000;
const NOT_DERIVED = new Set(['enumeration', 'refset', 'expression']);

function parseArgs(argv) {
  const args = { baseUrl: 'https://tx.ontoserver.csiro.au/fhir', maxSize: 10_000, graph: true, summary: false };
  const flags = {
    '--sets': 'sets',
    '--reference': 'reference',
    '--version': 'version',
    '--base-url': 'baseUrl',
    '--max-size': 'maxSize',
    '--only': 'only',
    '--out': 'out',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--summary') args.summary = true;
    else if (a === '--no-graph') args.graph = false;
    else if (flags[a] && i + 1 < argv.length) args[flags[a]] = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${a}`);
  }
  args.maxSize = Number(args.maxSize);
  if (!Number.isInteger(args.maxSize) || args.maxSize < 1) throw new Error('--max-size must be a positive integer');
  if (!args.out) throw new Error('--out is required');
  if (!args.summary && (!args.sets || !args.version)) throw new Error('--sets and --version are required');
  return args;
}

/** Rows of a DMWB export, keyed by ID, with the DESCRIPTION and SCTRULE columns. */
function readSets(file) {
  // DMWB exports are Latin-1; one starting with a UTF-8 byte-order mark is UTF-8.
  const bytes = fs.readFileSync(file);
  const utf8 = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const lines = (utf8 ? bytes.subarray(3).toString('utf8') : bytes.toString('latin1')).split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) throw new Error(`${file} is empty`);
  const header = lines[0].split('\t');
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`${file} has no ${name} column`);
    return i;
  };
  const [id, description, rule] = [col('ID'), col('DESCRIPTION'), col('SCTRULE')];
  const sets = new Map();
  for (const line of lines.slice(1)) {
    const r = line.split('\t');
    if (r[id]) sets.set(r[id], { name: r[description] ?? '', rule: r[rule] ?? '' });
  }
  return sets;
}

function readResults(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** The last row for each set: a resumed run appends a fresh row after an error row. */
function latestResults(file) {
  const latest = new Map();
  for (const r of readResults(file)) latest.set(r.refset, r);
  return [...latest.values()];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pick(c) {
  if (!c) return undefined;
  const cost = c.clauses + c.additions.count + c.misses.count;
  const ecl = c.ecl.length > 400 ? `${c.ecl.slice(0, 400)}…` : c.ecl;
  return {
    kind: c.construction.kind,
    clauses: c.clauses,
    adds: c.additions.count,
    misses: c.misses.count,
    exact: c.exact,
    cost,
    ecl,
  };
}

async function run(args) {
  const { deriveEcl } = require(path.join(DIST, 'derive', 'derive-ecl.js'));
  const { countClauses } = require(path.join(DIST, 'derive', 'set-queries.js'));
  const { FhirTerminologyService } = require(path.join(DIST, 'terminology', 'fhir-service.js'));

  const fhir = new FhirTerminologyService({ baseUrl: args.baseUrl, snomedVersion: args.version, timeout: TIMEOUT_MS });
  const expandCompose = fhir.expandCompose.bind(fhir);
  let requests = 0;
  fhir.expandCompose = (...a) => {
    requests++;
    return expandCompose(...a);
  };

  const sets = readSets(args.sets);
  const reference = args.reference ? readSets(args.reference) : new Map();
  const done = new Set(
    readResults(args.out)
      .filter((r) => !r.error)
      .map((r) => r.refset),
  );
  const only = args.only ? new Set(args.only.split(',')) : null;
  const codesOf = (rule) =>
    rule
      .split(' OR ')
      .map((c) => c.trim())
      .filter(Boolean);
  const todo = [...sets.entries()]
    .map(([refset, s]) => ({ refset, name: s.name, codes: codesOf(s.rule) }))
    .filter((s) => s.codes.length <= args.maxSize && !done.has(s.refset) && (!only || only.has(s.refset)))
    .sort((a, b) => a.codes.length - b.codes.length);

  const options = {
    omitTerms: true,
    refinements: 'never',
    hierarchySummary: false,
    maxCandidates: 30,
    sampleSize: 1,
    useGraph: args.graph,
  };
  const ctx = { deriveEcl, countClauses, fhir, expandCompose, reference, options, counted: () => requests };
  for (const set of todo) {
    let rec;
    // A set with no candidates gets none on a retry either.
    for (let attempt = 0; attempt < 2 && !rec?.top && !rec?.error?.startsWith(NO_CANDIDATES); attempt++) {
      if (attempt) await sleep(RETRY_MS);
      requests = 0;
      rec = await deriveOne(ctx, set);
    }
    fs.appendFileSync(args.out, `${JSON.stringify(rec)}\n`);
    console.log(
      set.refset,
      rec.given,
      rec.ms,
      rec.requests,
      rec.bestExact?.clauses,
      rec.reference?.clauses,
      rec.error ?? rec.reference?.error ?? '',
    );
    await sleep(PAUSE_MS);
  }
}

/** One set's result line: deriveEcl's best candidates and, when given, the reference judged on this release. */
async function deriveOne(ctx, { refset, name, codes }) {
  const rec = { refset, name, given: codes.length };
  try {
    const t = Date.now();
    const r = await ctx.deriveEcl({ conceptIds: codes }, ctx.fhir, ctx.options);
    rec.ms = Date.now() - t;
    rec.requests = ctx.counted();
    rec.members = r.input.members;
    if (r.candidates.length === 0) throw new Error(`${NO_CANDIDATES}: ${r.notes.join(' ') || 'none returned'}`);
    rec.top = pick(r.candidates[0]);
    rec.topDerived = pick(r.candidates.find((c) => !NOT_DERIVED.has(c.construction.kind)));
    const exact = r.candidates.filter((c) => c.exact);
    rec.bestExact = pick(exact.sort((a, b) => a.clauses - b.clauses || a.ecl.length - b.ecl.length)[0]);
    rec.notes = r.notes;
    const ref = ctx.reference.get(refset)?.rule;
    if (ref) rec.reference = await judgeOrError(ref, activeMembers(codes, r.input), ctx);
  } catch (error) {
    rec.error = messageOf(error);
    delete rec.top;
  }
  return rec;
}

/** The codes deriveEcl kept: the given ones less those it left out as inactive, unknown or malformed. */
function activeMembers(codes, input) {
  const left = new Set([...input.inactive, ...input.unknown, ...input.malformed]);
  return [...new Set(codes)].filter((c) => !left.has(c));
}

async function judgeOrError(ecl, members, ctx) {
  try {
    return await judge(ecl, members, ctx.expandCompose, ctx.countClauses);
  } catch (error) {
    return { error: messageOf(error) };
  }
}

function messageOf(error) {
  return String(error?.message ?? error).slice(0, 300);
}

/** The reference ECL's additions and misses against the members deriveEcl used, on this release. */
async function judge(ecl, codes, expandCompose, countClauses) {
  const members = { concepts: codes };
  const o = { count: 0, timeoutMs: TIMEOUT_MS };
  const [adds, misses] = await Promise.all([
    expandCompose({ include: [{ ecl }], exclude: [members] }, o),
    expandCompose({ include: [members], exclude: [{ ecl }] }, o),
  ]);
  const clauses = countClauses(ecl);
  const exact = adds.total === 0 && misses.total === 0;
  return {
    kind: 'reference',
    clauses,
    adds: adds.total,
    misses: misses.total,
    exact,
    cost: clauses + adds.total + misses.total,
  };
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summary(args) {
  const rows = latestResults(args.out);
  const ok = rows.filter((r) => !r.error && r.top);
  const errors = rows.filter((r) => r.error);
  console.log(`sets: ${rows.length}  scored: ${ok.length}  errors: ${errors.length}`);
  const tally = (pairs) => {
    const t = { win: 0, tie: 0, loss: 0 };
    for (const [a, b] of pairs) {
      if (a < b) t.win++;
      else if (a === b) t.tie++;
      else t.loss++;
    }
    return `win ${t.win} / tie ${t.tie} / loss ${t.loss} (n=${pairs.length})`;
  };
  const judged = ok.filter((r) => r.reference && !r.reference.error);
  if (judged.length) {
    console.log('top vs reference, by cost:', tally(judged.map((r) => [r.top.cost, r.reference.cost])));
    const exact = judged.filter((r) => r.bestExact);
    console.log(
      'best exact clauses vs reference clauses:',
      tally(exact.map((r) => [r.bestExact.clauses, r.reference.clauses])),
    );
    const sum = (f) => exact.reduce((n, r) => n + f(r), 0);
    console.log(
      `total clauses: ours (best exact) ${sum((r) => r.bestExact.clauses)}  reference ${sum((r) => r.reference.clauses)}`,
    );
    console.log(
      `reference exact on this release: ${judged.filter((r) => r.reference.exact).length} / ${judged.length}`,
    );
  } else {
    const exact = ok.filter((r) => r.bestExact);
    console.log(`total clauses: ours (best exact) ${exact.reduce((n, r) => n + r.bestExact.clauses, 0)}`);
  }
  const kinds = {};
  for (const r of ok) kinds[r.top.kind] = (kinds[r.top.kind] ?? 0) + 1;
  console.log('kind of top candidate:', kinds);
  if (ok.length > 0) {
    const ms = ok.map((r) => r.ms);
    const requests = ok.map((r) => r.requests);
    console.log(
      `deriveEcl time: median ${(median(ms) / 1000).toFixed(1)} s  max ${(Math.max(...ms) / 1000).toFixed(1)} s`,
    );
    console.log(`requests: median ${median(requests)}  max ${Math.max(...requests)}`);
  }
  for (const r of errors) console.log('error', r.refset, r.error.slice(0, 150));
  for (const r of ok.filter((x) => x.reference?.error)) {
    console.log('reference not judged', r.refset, r.reference.error.slice(0, 150));
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.summary) summary(args);
else
  run(args).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
