// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/**
 * ECL Specification Compliance Tests
 *
 * Test cases mined from the official SNOMED CT Expression Constraint Language specification:
 * https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language
 *
 * Each test references the specification section it validates.
 * Expressions are taken verbatim from the specification examples where possible.
 */
import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseECL } from '../parser';
import { NodeType } from '../parser/ast';

/** Helper: assert the expression parses with no errors and returns an AST */
function assertParses(ecl: string, label?: string) {
  const result = parseECL(ecl);
  assert.ok(result.ast, `${label ?? ecl}: should produce AST`);
  assert.equal(result.errors.length, 0, `${label ?? ecl}: should have no errors`);
  return result;
}

/** Helper: assert the expression produces parse errors */
function assertParseError(ecl: string, label?: string) {
  const result = parseECL(ecl);
  assert.ok(result.errors.length > 0, `${label ?? ecl}: should produce errors`);
}

// =============================================================================
// §6.1 Simple Expression Constraints
// https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language/examples/#simple-expression-constraints
// =============================================================================
describe('ECL Spec §6.1: Simple Expression Constraints', () => {
  test('self constraint — concept reference without operator', () => {
    assertParses('404684003 |Clinical finding|');
  });

  test('descendant-of (<)', () => {
    assertParses('< 404684003 |Clinical finding|');
  });

  test('descendant-or-self-of (<<)', () => {
    assertParses('<< 73211009 |Diabetes mellitus|');
  });

  test('child-of (<!)', () => {
    assertParses('<! 404684003 |Clinical finding|');
  });

  test('child-or-self-of (<<!)', () => {
    assertParses('<<! 404684003 |Clinical finding|');
  });

  test('ancestor-of (>)', () => {
    assertParses('> 40541001 |Acute pulmonary edema|');
  });

  test('ancestor-or-self-of (>>)', () => {
    assertParses('>> 40541001 |Acute pulmonary edema|');
  });

  test('parent-of (>!)', () => {
    assertParses('>! 40541001 |Acute pulmonary edema|');
  });

  test('parent-or-self-of (>>!)', () => {
    assertParses('>>! 40541001 |Acute pulmonary edema|');
  });

  test('member-of (^)', () => {
    assertParses('^ 700043003 |Example problem list concepts reference set|');
  });

  test('any concept — wildcard (*)', () => {
    assertParses('*');
  });

  test('descendant-or-self of wildcard (<<*) — any concept including root', () => {
    assertParses('<< *');
  });

  test('descendant of wildcard (<*) — all concepts except root', () => {
    assertParses('< *');
  });

  test('ancestor-or-self of wildcard (>>*)', () => {
    assertParses('>> *');
  });

  test('ancestor of wildcard (>*)', () => {
    assertParses('> *');
  });

  test('child-of wildcard (<!*)', () => {
    assertParses('<! *');
  });

  test('parent-of wildcard (>!*)', () => {
    assertParses('>! *');
  });
});

// =============================================================================
// §6.2 Refinements
// https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language/examples/#refinements
// =============================================================================
describe('ECL Spec §6.2: Refinements', () => {
  test('basic attribute refinement with exact value', () => {
    assertParses('< 19829001 |Disorder of lung| : 116676008 |Associated morphology| = 79654002 |Edema|');
  });

  test('attribute value with descendant-or-self-of', () => {
    assertParses('< 19829001 |Disorder of lung| : 116676008 |Associated morphology| = << 79654002 |Edema|');
  });

  test('multiple attributes (comma-separated AND)', () => {
    const result = assertParses(
      '< 404684003 |Clinical finding| : 363698007 |Finding site| = << 39057004 |Pulmonary valve structure| , 116676008 |Associated morphology| = << 415582006 |Stenosis|',
    );
    // Should have refined expression with 2 attributes
    assert.ok(result.ast);
    if (result.ast.expression.type === NodeType.RefinedExpression) {
      assert.equal(result.ast.expression.refinement.attributes.length, 2);
    }
  });

  test('wildcard focus concept with attribute', () => {
    assertParses('* : 246075003 |Causative agent| = 387517004 |Paracetamol|');
  });

  test('two attribute groups', () => {
    assertParses(
      '< 404684003 |Clinical finding| : { 363698007 |Finding site| = << 39057004 |Pulmonary valve structure| , 116676008 |Associated morphology| = << 415582006 |Stenosis| } , { 363698007 |Finding site| = << 53085002 |Right ventricular structure| , 116676008 |Associated morphology| = << 56246009 |Hypertrophy| }',
    );
  });

  test('descendant-or-self-of on attribute name', () => {
    assertParses('<< 404684003 |Clinical finding| : << 47429007 |Associated with| = << 267038008 |Edema|');
  });

  test('ancestor-or-self-of on attribute name', () => {
    assertParses('<< 404684003 |Clinical finding| : >> 42752001 |Due to| = << 267038008 |Edema|');
  });

  test('reverse attribute (R flag)', () => {
    assertParses('< 91723000 |Anatomical structure| : R 363698007 |Finding site| = < 125605004 |Fracture of bone|');
  });

  test('simple dotted expression', () => {
    assertParses('< 125605004 |Fracture of bone| . 363698007 |Finding site|');
  });

  test('dotted expression with AND', () => {
    assertParses('< 91723000 |Anatomical structure| AND (< 125605004 |Fracture of bone| . 363698007 |Finding site|)');
  });

  test('reverse with descendant operator on attribute name', () => {
    assertParses(
      '< 105590001 |Substance| : R << 127489000 |Has active ingredient| = < 27658006 |Product containing amoxicillin|',
    );
  });

  test('dotted with descendant operator', () => {
    assertParses('< 27658006 |Product containing amoxicillin| . << 127489000 |Has active ingredient|');
  });

  test('sequential dotted attributes (chained)', () => {
    assertParses('< 19829001 |Disorder of lung| . < 47429007 |Associated with| . 363698007 |Finding site|');
  });

  test('sequential dotted with explicit brackets', () => {
    assertParses('((< 19829001 |Disorder of lung|) . < 47429007 |Associated with|) . 363698007 |Finding site|');
  });

  test('wildcard attribute name', () => {
    assertParses('< 404684003 |Clinical finding| : * = 79654002 |Edema|');
  });

  test('wildcard attribute value', () => {
    assertParses('< 404684003 |Clinical finding| : 116676008 |Associated morphology| = *');
  });

  test('numeric concrete value (>= #250)', () => {
    assertParses(
      '< 763158003 |Medicinal product| : { << 127489000 |Has active ingredient| = << 372687004 |Amoxicillin| , 1142135004 |Has presentation strength numerator value| >= #250 , 732945000 |Has presentation strength numerator unit| = 258684004 |milligram| }',
    );
  });

  test('string concrete value', () => {
    assertParses('< 373873005 |Pharmaceutical / biologic product| : 3460481009 |Has product name| = "PANADOL"');
  });

  test('boolean concrete value (TRUE)', () => {
    assertParses(
      '< 373873005 |Pharmaceutical / biologic product| : 859999999102 |Is in national benefit scheme| = TRUE',
    );
  });
});

// =============================================================================
// §6.3 Cardinality
// https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language/examples/#cardinality
// =============================================================================
describe('ECL Spec §6.3: Cardinality', () => {
  test('[1..3] on attribute', () => {
    assertParses(
      '< 373873005 |Pharmaceutical / biologic product| : [1..3] 127489000 |Has active ingredient| = < 105590001 |Substance|',
    );
  });

  test('[1..1] exact cardinality', () => {
    assertParses(
      '< 373873005 |Pharmaceutical / biologic product| : [1..1] 127489000 |Has active ingredient| = < 105590001 |Substance|',
    );
  });

  test('[0..1] at most one', () => {
    assertParses(
      '< 373873005 |Pharmaceutical / biologic product| : [0..1] 127489000 |Has active ingredient| = < 105590001 |Substance|',
    );
  });

  test('[1..*] at least one', () => {
    assertParses(
      '< 373873005 |Pharmaceutical / biologic product| : [1..*] 127489000 |Has active ingredient| = < 105590001 |Substance|',
    );
  });

  test('[2..*] two or more without groups', () => {
    assertParses(
      '< 404684003 |Clinical finding| : [2..*] 363698007 |Finding site| = < 91723000 |Anatomical structure|',
    );
  });

  test('cardinality within attribute group', () => {
    assertParses(
      '< 404684003 |Clinical finding| : { [2..*] 363698007 |Finding site| = < 91723000 |Anatomical structure| }',
    );
  });

  test('group cardinality [1..3] + attribute cardinality [1..*]', () => {
    assertParses(
      '< 373873005 |Pharmaceutical / biologic product| : [1..3] { [1..*] 127489000 |Has active ingredient| = < 105590001 |Substance| }',
    );
  });

  test('group cardinality [0..1]', () => {
    assertParses(
      '< 373873005 |Pharmaceutical / biologic product| : [0..1] { 127489000 |Has active ingredient| = < 105590001 |Substance| }',
    );
  });

  test('negative constraint [0..0] on group', () => {
    assertParses(
      '< 404684003 |Clinical finding| : [0..0] { [2..*] 363698007 |Finding site| = < 91723000 |Anatomical structure| }',
    );
  });

  test('reverse cardinality [3..3]', () => {
    assertParses('< 105590001 |Substance| : [3..3] R 127489000 |Has active ingredient| = *');
  });
});

// =============================================================================
// §6.4 Conjunction and Disjunction
// https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language/examples/#conjunction-and-disjunction
// =============================================================================
describe('ECL Spec §6.4: Conjunction and Disjunction', () => {
  test('compound AND (intersection)', () => {
    assertParses('< 19829001 |Disorder of lung| AND < 301867009 |Edema of trunk|');
  });

  test('case-insensitive AND', () => {
    assertParses('< 19829001 |Disorder of lung| and < 301867009 |Edema of trunk|');
  });

  test('compound OR (union)', () => {
    assertParses('< 19829001 |Disorder of lung| OR < 301867009 |Edema of trunk|');
  });

  test('AND with member-of', () => {
    assertParses('< 19829001 |Disorder of lung| AND ^ 700043003 |Example problem list concepts reference set|');
  });

  test('three-way AND', () => {
    const result = assertParses(
      '< 19829001 |Disorder of lung| AND < 301867009 |Edema of trunk| AND ^ 700043003 |Example problem list concepts reference set|',
    );
    // N-ary: should have 3 operands
    assert.ok(result.ast);
    if (result.ast.expression.type === NodeType.CompoundExpression) {
      assert.equal(result.ast.expression.operands.length, 3);
    }
  });

  test('bracketed conjunction', () => {
    assertParses('(< 19829001 |Disorder of lung| AND < 301867009 |Edema of trunk|) AND ^ 700043003');
  });

  test('attribute conjunction (AND between attributes)', () => {
    assertParses(
      '< 404684003 |Clinical finding| : 363698007 |Finding site| = << 39057004 |Pulmonary valve structure| AND 116676008 |Associated morphology| = << 415582006 |Stenosis|',
    );
  });

  test('attribute disjunction (OR between attributes)', () => {
    assertParses(
      '< 404684003 |Clinical finding| : 116676008 |Associated morphology| = << 55641003 |Infarct| OR 42752001 |Due to| = << 22298006 |Myocardial infarction|',
    );
  });

  test('OR between attribute groups', () => {
    assertParses(
      '< 404684003 |Clinical finding| : { 363698007 |Finding site| = << 39057004 |Pulmonary valve structure| , 116676008 |Associated morphology| = << 415582006 |Stenosis| } OR { 363698007 |Finding site| = << 53085002 |Right ventricular structure| , 116676008 |Associated morphology| = << 56246009 |Hypertrophy| }',
    );
  });

  test('OR in attribute value', () => {
    assertParses(
      '^ 450990004 |Adverse drug reactions reference set| : 246075003 |Causative agent| = (< 373873005 |Pharmaceutical / biologic product| OR < 105590001 |Substance|)',
    );
  });

  test('AND in attribute value', () => {
    assertParses(
      '< 404684003 |Clinical finding| : 116676008 |Associated morphology| = (<< 56208002 |Ulcer| AND << 50960005 |Hemorrhage|)',
    );
  });

  test('INVALID: mixed AND/OR without brackets', () => {
    // ECL spec requires disambiguation brackets when mixing AND and OR
    assertParseError(
      '< 19829001 |Disorder of lung| AND < 301867009 |Edema of trunk| OR ^ 700043003 |Example problem list concepts reference set|',
    );
  });

  test('mixed AND/OR in attributes without brackets — spec says invalid but ANTLR grammar accepts', () => {
    // Per ECL spec §6.4, mixing AND and OR without brackets is ambiguous and invalid.
    // However, the ANTLR grammar parses it without error (left-to-right precedence).
    // This test documents the parser's actual behavior.
    const result = parseECL(
      '< 404684003 |Clinical finding| : 363698007 |Finding site| = << 39057004 |Pulmonary valve structure| AND 116676008 |Associated morphology| = << 415582006 |Stenosis| OR 42752001 |Due to| = << 445238008 |Malignant carcinoid tumor|',
    );
    assert.ok(result.ast, 'ANTLR grammar accepts mixed AND/OR in attributes');
  });
});

// =============================================================================
// §6.5 Exclusion and Not-Equals
// https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language/examples/#exclusion-and-not-equals
// =============================================================================
describe('ECL Spec §6.5: Exclusion and Not-Equals', () => {
  test('MINUS operator for exclusion', () => {
    assertParses('<< 19829001 |Disorder of lung| MINUS << 301867009 |Edema of trunk|');
  });

  test('MINUS with member-of', () => {
    assertParses('<< 19829001 |Disorder of lung| MINUS ^ 700043003 |Example problem list concepts reference set|');
  });

  test('MINUS in attribute value', () => {
    assertParses(
      '< 404684003 |Clinical finding| : 116676008 |Associated morphology| = ((<< 56208002 |Ulcer| AND << 50960005 |Hemorrhage|) MINUS << 26036001 |Obstruction|)',
    );
  });

  test('not-equals operator (!=) on attribute', () => {
    assertParses('< 404684003 |Clinical finding| : 116676008 |Associated morphology| != << 26036001 |Obstruction|');
  });

  test('cardinality [0..0] as negation', () => {
    assertParses(
      '< 404684003 |Clinical finding| : [0..0] 116676008 |Associated morphology| = << 26036001 |Obstruction|',
    );
  });

  test('cardinality [0..0] with !=', () => {
    assertParses(
      '< 404684003 |Clinical finding| : [0..0] 116676008 |Associated morphology| != << 26036001 |Obstruction|',
    );
  });
});

// =============================================================================
// §6.6 Constraint Comments
// https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language/examples/#comments
// =============================================================================
describe('ECL Spec §6.6: Comments', () => {
  test('block comments within expression', () => {
    assertParses(
      '/* Disorders of lung with edema */ < 19829001 |Disorder of lung| : 116676008 |Associated morphology| = << 79654002 |Edema|',
    );
  });
});

// =============================================================================
// §6.7 Nested Expression Constraints
// https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language/examples/#nested-expression-constraints
// =============================================================================
describe('ECL Spec §6.7: Nested Expression Constraints', () => {
  test('constraint operator on nested member-of', () => {
    assertParses('<< (^ 700043003 |Example problem list concepts reference set|)');
  });

  test('descendant-of nested dotted expression', () => {
    assertParses('< (125605004 |Fracture of bone| . 363698007 |Finding site|)');
  });

  test('bracketed expression followed by dot', () => {
    assertParses('(< 125605004 |Fracture of bone|) . 363698007 |Finding site|');
  });

  test('refined expression ANDed with member-of', () => {
    assertParses(
      '(< 404684003 |Clinical finding| : 363698007 |Finding site| = << 39057004 |Pulmonary valve structure|) AND ^ 700043003',
    );
  });

  test('dotted attribute on nested refined expression', () => {
    assertParses(
      '(<< 17636008 |Specimen collection| : 424226004 |Using device| = << 19923001 |Catheter|) . 363701004 |Direct substance|',
    );
  });

  test('nested expression as attribute value', () => {
    assertParses(
      '< 404684003 |Clinical finding| : 47429007 |Associated with| = (< 404684003 |Clinical finding| : 116676008 |Associated morphology| = << 55641003 |Infarct|)',
    );
  });
});

// =============================================================================
// §6.8 Description Filters ({{ D ... }})
// https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language/examples/#description-filters
// Filter constraints are represented in the AST via FilterConstraintNode.
// Concept-bearing parts (typeId, moduleId, dialectId, definitionStatusId) are extracted into the AST.
// These tests verify the parser handles filter syntax correctly.
// =============================================================================
describe('ECL Spec §6.8: Description Filters', () => {
  test('basic term filter with D prefix — standalone filter requires wildcard focus', () => {
    // Standalone {{ D ... }} without a focus concept is valid ECL but our parser
    // expects a focus concept. Using * as focus is the equivalent.
    assertParses('* {{ D term = "heart att" }}');
  });

  test('term filter without D prefix', () => {
    assertParses('< 64572001 |Disease| {{ term = "heart att" }}');
  });

  test('multiple term filters (AND)', () => {
    assertParses('< 64572001 |Disease| {{ term = "heart", term = "att" }}');
  });

  test('explicit match keyword', () => {
    assertParses('< 64572001 |Disease| {{ term = match:"heart att" }}');
  });

  test('term filter with set (OR)', () => {
    assertParses('< 64572001 |Disease| {{ term = ("heart" "card") }}');
  });

  test('wildcard search filter', () => {
    assertParses('< 64572001 |Disease| {{ term = wild:"cardi*opathy" }}');
  });

  test('language filter', () => {
    assertParses('< 64572001 |Disease| {{ term = "hjart", language = sv }}');
  });

  test('type filter (FSN)', () => {
    assertParses('< 56265001 |Heart disease| {{ term = "heart", type = fsn }}');
  });

  test('type filter with set', () => {
    assertParses('< 56265001 |Heart disease| {{ term = "heart", type = (syn fsn) }}');
  });

  test('dialect filter', () => {
    assertParses('< 64572001 |Disease| {{ term = "box", type = syn, dialect = en-us (prefer) }}');
  });

  test('negation with != in term filter', () => {
    assertParses('< 125605004 |Fracture of bone| {{ term != "fracture", type = syn, dialect = en-us (prefer) }}');
  });

  test('active filter (boolean)', () => {
    assertParses('^ 816080008 |International Patient Summary| {{ D active = true }}');
  });
});

// =============================================================================
// §6.9 Concept Filters ({{ C ... }})
// https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language/examples/#concept-filters
// =============================================================================
describe('ECL Spec §6.9: Concept Filters', () => {
  test('definition status token filter (primitive)', () => {
    assertParses('< 56265001 |Heart disease| {{ C definitionStatus = primitive }}');
  });

  test('definition status ID filter', () => {
    assertParses('< 56265001 |Heart disease| {{ C definitionStatusId = 900000000000074008 |Primitive| }}');
  });

  test('defined status filter', () => {
    assertParses('< 56265001 |Heart disease| {{ C definitionStatus = defined }}');
  });

  test('combined concept + description filters', () => {
    assertParses('< 64572001 |Disease| {{ C definitionStatus = primitive }} {{ D term = "heart" }}');
  });

  test('module filter on concept', () => {
    assertParses(
      '< 195967001 |Asthma| {{ C moduleId = 731000124108 |US National Library of Medicine maintained module| }}',
    );
  });

  test('active concept filter', () => {
    assertParses('^ 816080008 |International Patient Summary| {{ C active = 1 }}');
  });
});

// =============================================================================
// §6.10 Member Filters ({{ M ... }})
// https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language/examples/#member-filters
// =============================================================================
describe('ECL Spec §6.10: Member Filters', () => {
  test('member field string match', () => {
    assertParses('^ 447562003 |ICD-10 complex map reference set| {{ M mapTarget = "J45.9" }}');
  });

  test('member field wildcard', () => {
    assertParses('^ 447562003 |ICD-10 complex map reference set| {{ M mapTarget = wild:"J45*" }}');
  });

  test('multiple member field constraints', () => {
    assertParses(
      '^ 447562003 |ICD-10 complex map reference set| {{ M mapGroup = #2, mapPriority = #1, mapTarget = "J45.9" }}',
    );
  });

  test('mixed comparison operators on member fields', () => {
    assertParses(
      '^ 447562003 |ICD-10 complex map reference set| {{ M mapGroup != #2, mapPriority < #2, mapTarget = wild:"J*" }}',
    );
  });

  test('effective time on member', () => {
    assertParses('^ 816080008 |International Patient Summary| {{ M effectiveTime >= "20210731" }}');
  });

  test('active status on member', () => {
    assertParses('^ 816080008 |International Patient Summary| {{ M active = 0 }}');
  });
});

// =============================================================================
// §6.11 History Supplements ({{ + HISTORY... }})
// https://docs.snomed.org/snomed-ct-specifications/snomed-ct-expression-constraint-language/examples/#history-supplements
// =============================================================================
describe('ECL Spec §6.11: History Supplements', () => {
  test('history supplement with explicit association', () => {
    assertParses('<< 195967001 |Asthma| {{ + HISTORY (900000000000527005 |SAME AS association reference set|) }}');
  });

  test('history minimum precision', () => {
    assertParses('<< 195967001 |Asthma| {{ + HISTORY-MIN }}');
  });

  test('history moderate precision', () => {
    assertParses('<< 195967001 |Asthma| {{ + HISTORY-MOD }}');
  });

  test('history maximum recall', () => {
    assertParses('<< 195967001 |Asthma| {{ + HISTORY-MAX }}');
  });

  test('history with wildcard', () => {
    assertParses('<< 195967001 |Asthma| {{ + HISTORY (*) }}');
  });

  test('history shorthand (max recall)', () => {
    assertParses('<< 195967001 |Asthma| {{ + HISTORY }}');
  });
});
