// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { eclSnippetCompletions } from '../completion/snippets';
import { getCompletionItems } from '../completion/provider';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Extract labels from completion items for easy assertion. */
function labels(items: ReturnType<typeof getCompletionItems>): string[] {
  return items.map((i) => i.label);
}

/** Check whether the result set contains any Snippet-kind items. */
function hasSnippets(items: ReturnType<typeof getCompletionItems>): boolean {
  return items.some((i) => i.kind === 'snippet');
}

/** Check whether the result set contains the concept-search item. */
function hasSearch(items: ReturnType<typeof getCompletionItems>): boolean {
  return items.some((i) => i.label.includes('Search for concept'));
}

/** Check whether the result set contains any Keyword items (AND/OR/MINUS). */
function hasKeywords(items: ReturnType<typeof getCompletionItems>): boolean {
  return items.some((i) => i.kind === 'keyword');
}

/** Check whether the result set contains any Operator items (<, <<, >, >>). */
function hasOperators(items: ReturnType<typeof getCompletionItems>): boolean {
  return items.some((i) => i.kind === 'operator');
}

// ═════════════════════════════════════════════════════════════════════
// 1. SNIPPET DATA STRUCTURE TESTS
// ═════════════════════════════════════════════════════════════════════

describe('ECL Snippet Completions — data structure', () => {
  it('should have 8 snippet completions', () => {
    assert.strictEqual(eclSnippetCompletions.length, 8);
  });

  it('all snippets should have kind snippet', () => {
    for (const snippet of eclSnippetCompletions) {
      assert.strictEqual(snippet.kind, 'snippet', `Snippet "${snippet.label}" should have kind Snippet`);
    }
  });

  it('all snippets should have insertTextFormat snippet', () => {
    for (const snippet of eclSnippetCompletions) {
      assert.strictEqual(
        snippet.insertTextFormat,
        'snippet',
        `Snippet "${snippet.label}" should have insertTextFormat Snippet`,
      );
    }
  });

  it('all snippets should have insertText with tab-stop placeholders', () => {
    for (const snippet of eclSnippetCompletions) {
      assert.ok(
        snippet.insertText && /\$\{\d+:/.test(snippet.insertText),
        `Snippet "${snippet.label}" insertText should contain tab-stop placeholders`,
      );
    }
  });

  it('all snippets should have sortText starting with "z"', () => {
    for (const snippet of eclSnippetCompletions) {
      assert.ok(snippet.sortText?.startsWith('z'), `Snippet "${snippet.label}" sortText should start with "z"`);
    }
  });

  it('all snippets should have a non-empty detail string', () => {
    for (const snippet of eclSnippetCompletions) {
      assert.ok(
        typeof snippet.detail === 'string' && snippet.detail.length > 0,
        `Snippet "${snippet.label}" should have a non-empty detail`,
      );
    }
  });

  it('all snippet sortText values should be unique', () => {
    const sortTexts = eclSnippetCompletions.map((s) => s.sortText);
    assert.strictEqual(new Set(sortTexts).size, sortTexts.length);
  });

  it('snippet sortText should sort after operator labels', () => {
    for (const snippet of eclSnippetCompletions) {
      for (const op of ['AND', 'OR', 'MINUS', '<', '<<', '>', '>>']) {
        assert.ok(snippet.sortText! > op);
      }
    }
  });
});

describe('ECL Snippet Completions — specific content', () => {
  const byLabel = (label: string) => eclSnippetCompletions.find((s) => s.label === label);

  it('Descendant of', () => {
    assert.strictEqual(byLabel('Descendant of')?.insertText, '< ${1:conceptId} |${2:term}|');
  });
  it('Descendant or self of', () => {
    assert.strictEqual(byLabel('Descendant or self of')?.insertText, '<< ${1:conceptId} |${2:term}|');
  });
  it('Ancestor of', () => {
    assert.strictEqual(byLabel('Ancestor of')?.insertText, '> ${1:conceptId} |${2:term}|');
  });
  it('Ancestor or self of', () => {
    assert.strictEqual(byLabel('Ancestor or self of')?.insertText, '>> ${1:conceptId} |${2:term}|');
  });
  it('Simple refinement', () => {
    assert.strictEqual(byLabel('Simple refinement')?.insertText, '<< ${1:concept}: ${2:attribute} = << ${3:value}');
  });
  it('Grouped refinement', () => {
    assert.strictEqual(
      byLabel('Grouped refinement')?.insertText,
      '<< ${1:concept}: { ${2:attribute} = << ${3:value} }',
    );
  });
  it('Nested expression', () => {
    assert.strictEqual(byLabel('Nested expression')?.insertText, '<< ${1:concept}: ${2:attribute} = (<< ${3:value})');
  });
  it('Multi-attribute refinement', () => {
    assert.strictEqual(
      byLabel('Multi-attribute refinement')?.insertText,
      '<< ${1:concept}: ${2:attr1} = << ${3:val1}, ${4:attr2} = << ${5:val2}',
    );
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. COMPLETION PROVIDER INTEGRATION TESTS
//    These exercise getCompletionItems() — the pure function that the
//    LSP handler delegates to — verifying every decision branch.
// ═════════════════════════════════════════════════════════════════════

describe('getCompletionItems — between expressions (inExpression=false)', () => {
  it('should return only snippet completions', () => {
    const items = getCompletionItems(false, '', '', 0);
    assert.ok(hasSnippets(items), 'Should contain snippets');
    assert.ok(!hasSearch(items), 'Should NOT contain concept search');
    assert.ok(!hasKeywords(items), 'Should NOT contain keyword operators');
    assert.ok(!hasOperators(items), 'Should NOT contain constraint operators');
  });

  it('should return exactly the eclSnippetCompletions array', () => {
    const items = getCompletionItems(false, '', '', 0);
    assert.deepStrictEqual(items, eclSnippetCompletions);
  });

  it('all returned items should have kind Snippet', () => {
    const items = getCompletionItems(false, '', '', 0);
    for (const item of items) {
      assert.strictEqual(item.kind, 'snippet');
    }
  });
});

describe('getCompletionItems — start of expression (empty line)', () => {
  // Empty line within an expression: constraint operators valid, concept valid, priority low
  it('should include constraint operators', () => {
    const items = getCompletionItems(true, '', '', 0);
    const lbls = labels(items);
    assert.ok(lbls.includes('<'), 'Should include <');
    assert.ok(lbls.includes('<<'), 'Should include <<');
    assert.ok(lbls.includes('>'), 'Should include >');
    assert.ok(lbls.includes('>>'), 'Should include >>');
  });

  it('should include concept search', () => {
    const items = getCompletionItems(true, '', '', 0);
    assert.ok(hasSearch(items), 'Should include concept search');
  });

  it('should include snippet completions', () => {
    const items = getCompletionItems(true, '', '', 0);
    assert.ok(hasSnippets(items), 'Should include snippets at expression start');
  });

  it('should NOT include logical operators (AND/OR/MINUS)', () => {
    const items = getCompletionItems(true, '', '', 0);
    const lbls = labels(items);
    assert.ok(!lbls.includes('AND'));
    assert.ok(!lbls.includes('OR'));
    assert.ok(!lbls.includes('MINUS'));
  });

  it('operators should appear before snippets', () => {
    const items = getCompletionItems(true, '', '', 0);
    const firstSnippetIdx = items.findIndex((i) => i.kind === 'snippet');
    const lastOperatorIdx = items.map((i, idx) => (i.kind === 'operator' ? idx : -1)).findLast((idx) => idx >= 0) ?? -1;
    assert.ok(
      lastOperatorIdx < firstSnippetIdx,
      `Last operator (index ${lastOperatorIdx}) should appear before first snippet (index ${firstSnippetIdx})`,
    );
  });
});

describe('getCompletionItems — after logical operator (AND/OR/MINUS)', () => {
  for (const op of ['AND', 'OR', 'MINUS']) {
    it(`after "${op} " should include constraint operators`, () => {
      const text = `< 404684003 ${op} `;
      const items = getCompletionItems(true, text, text, text.length);
      const lbls = labels(items);
      assert.ok(lbls.includes('<'));
      assert.ok(lbls.includes('<<'));
    });

    it(`after "${op} " should include concept search`, () => {
      const text = `< 404684003 ${op} `;
      const items = getCompletionItems(true, text, text, text.length);
      assert.ok(hasSearch(items));
    });

    it(`after "${op} " should include snippets`, () => {
      const text = `< 404684003 ${op} `;
      const items = getCompletionItems(true, text, text, text.length);
      assert.ok(hasSnippets(items), `Snippets should appear after ${op}`);
    });

    it(`after "${op} " should NOT include logical operators`, () => {
      const text = `< 404684003 ${op} `;
      const items = getCompletionItems(true, text, text, text.length);
      assert.ok(!hasKeywords(items), `Should not show AND/OR/MINUS after ${op}`);
    });
  }
});

describe('getCompletionItems — after constraint operator (concept expected)', () => {
  it('after "< " should show search first, no snippets', () => {
    const text = '< ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(hasSearch(items), 'Should include concept search');
    assert.ok(!hasSnippets(items), 'Should NOT include snippets (concept expected)');
    // Search should be the first item
    assert.ok(items[0].label.includes('Search'), 'Search should be first');
  });

  it('after "<< " should show search first, no snippets', () => {
    const text = '<< ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(hasSearch(items));
    assert.ok(!hasSnippets(items));
  });

  it('after "> " should show search first, no snippets', () => {
    const text = '> ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(hasSearch(items));
    assert.ok(!hasSnippets(items));
  });

  it('after ">> " should show search first, no snippets', () => {
    const text = '>> ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(hasSearch(items));
    assert.ok(!hasSnippets(items));
  });
});

describe('getCompletionItems — after complete concept (logical operators expected)', () => {
  it('after concept ID should show only logical operators + refinement', () => {
    const text = '< 404684003 ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('AND'));
    assert.ok(lbls.includes('OR'));
    assert.ok(lbls.includes('MINUS'));
    assert.ok(!hasSnippets(items), 'Should NOT include snippets after concept');
    assert.ok(!hasSearch(items), 'Should NOT include search after concept');
    assert.ok(!lbls.includes('<'), 'Should NOT include < after concept');
  });

  it('after concept with term should show only logical operators + refinement', () => {
    const text = '< 404684003 |Clinical finding| ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('AND'));
    assert.ok(!hasSnippets(items));
    assert.ok(!hasSearch(items));
  });
});

describe('getCompletionItems — after refinement/attribute separators', () => {
  it('after ": " should show constraint operators + search + snippets', () => {
    const text = '< 404684003 : ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(hasOperators(items), 'Should include constraint operators');
    assert.ok(hasSearch(items), 'Should include search');
    assert.ok(hasSnippets(items), 'Should include snippets');
  });

  it('after "= " should show constraint operators + search + snippets', () => {
    const text = '363698007 = ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(hasOperators(items));
    assert.ok(hasSearch(items));
    assert.ok(hasSnippets(items));
  });
});

describe('getCompletionItems — after opening parenthesis', () => {
  it('after "(" should show constraint operators + search + snippets', () => {
    const text = '(';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(hasOperators(items), 'Should include constraint operators');
    assert.ok(hasSearch(items), 'Should include search');
    assert.ok(hasSnippets(items), 'Should include snippets');
  });
});

describe('getCompletionItems — partial operator (completing < to <<)', () => {
  it('after "<" (no space) should show << as completion', () => {
    const text = '<';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('<<'), 'Should offer << completion');
  });

  it('after ">" (no space) should show >> as completion', () => {
    const text = '>';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('>>'), 'Should offer >> completion');
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. CONTEXT-AWARE COMPLETION TESTS (new: ECL 2.2 full coverage)
// ═════════════════════════════════════════════════════════════════════

function item(text: string) {
  return getCompletionItems(true, text, text, text.length);
}

describe('getCompletionItems — extended operators at expression start', () => {
  it('should include child-of operators', () => {
    const lbls = labels(item(''));
    assert.ok(lbls.includes('<!'), 'Should include <! (child of)');
    assert.ok(lbls.includes('<<!'), 'Should include <<! (child or self of)');
  });

  it('should include parent-of operators', () => {
    const lbls = labels(item(''));
    assert.ok(lbls.includes('>!'), 'Should include >! (parent of)');
    assert.ok(lbls.includes('>>!'), 'Should include >>! (parent or self of)');
  });

  it('should include member-of operator', () => {
    const lbls = labels(item(''));
    assert.ok(lbls.includes('^'), 'Should include ^ (member of)');
  });

  it('should include top/bottom operators', () => {
    const lbls = labels(item(''));
    assert.ok(lbls.includes('!!>'), 'Should include !!> (top)');
    assert.ok(lbls.includes('!!<'), 'Should include !!< (bottom)');
  });
});

describe('getCompletionItems — extended operators after logical operator', () => {
  it('should include child/parent operators after AND', () => {
    const lbls = labels(item('< 404684003 AND '));
    assert.ok(lbls.includes('<!'));
    assert.ok(lbls.includes('<<!'));
    assert.ok(lbls.includes('>!'));
    assert.ok(lbls.includes('>>!'));
  });

  it('should include member-of and top/bottom after OR', () => {
    const lbls = labels(item('< 404684003 OR '));
    assert.ok(lbls.includes('^'));
    assert.ok(lbls.includes('!!>'));
    assert.ok(lbls.includes('!!<'));
  });
});

describe('getCompletionItems — after concept shows continuation items', () => {
  it('should include dot notation after concept', () => {
    const lbls = labels(item('< 404684003 '));
    assert.ok(lbls.includes('.'), 'Should include . (dot notation)');
  });

  it('should include refinement colon after concept', () => {
    const lbls = labels(item('< 404684003 '));
    assert.ok(lbls.includes(':'), 'Should include : (refinement)');
  });

  it('should include filter openers after concept', () => {
    const lbls = labels(item('< 404684003 '));
    assert.ok(lbls.includes('{{ D'), 'Should include {{ D (description filter)');
    assert.ok(lbls.includes('{{ C'), 'Should include {{ C (concept filter)');
    assert.ok(lbls.includes('{{ M'), 'Should include {{ M (member filter)');
    assert.ok(lbls.includes('{{ +'), 'Should include {{ + (history supplement)');
  });

  it('should NOT include dot at expression start', () => {
    const lbls = labels(item(''));
    assert.ok(!lbls.includes('.'), 'Should NOT include . at expression start');
  });

  it('should NOT include filter openers at expression start', () => {
    const lbls = labels(item(''));
    assert.ok(!lbls.includes('{{ D'), 'Should NOT include {{ D at expression start');
  });

  it('should NOT include dot after logical operator', () => {
    const lbls = labels(item('< 404684003 AND '));
    assert.ok(!lbls.includes('.'), 'Should NOT include . after AND');
  });
});

describe('getCompletionItems — refinement-start completions', () => {
  it('should include cardinality snippets after colon', () => {
    const lbls = labels(item('< 404684003 : '));
    assert.ok(lbls.includes('[0..0]'), 'Should include [0..0]');
    assert.ok(lbls.includes('[0..1]'), 'Should include [0..1]');
    assert.ok(lbls.includes('[0..*]'), 'Should include [0..*]');
    assert.ok(lbls.includes('[1..1]'), 'Should include [1..1]');
    assert.ok(lbls.includes('[1..*]'), 'Should include [1..*]');
  });

  it('should include attribute group opener after colon', () => {
    const lbls = labels(item('< 404684003 : '));
    assert.ok(lbls.includes('{ }'), 'Should include { } (attribute group)');
  });

  it('should include reverse flag after colon', () => {
    const lbls = labels(item('< 404684003 : '));
    assert.ok(lbls.includes('R'), 'Should include R (reverse flag)');
  });

  it('should include member-of after colon', () => {
    const lbls = labels(item('< 404684003 : '));
    assert.ok(lbls.includes('^'), 'Should include ^ (member of)');
  });
});

describe('getCompletionItems — after attribute name shows comparison operators', () => {
  it('should show = and != after attribute name', () => {
    const text = '< 404684003 : 363698007 ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('='), 'Should include =');
    assert.ok(lbls.includes('!='), 'Should include !=');
  });

  it('should NOT show = at expression start', () => {
    const lbls = labels(item(''));
    assert.ok(!lbls.includes('='), 'Should NOT include = at expression start');
    assert.ok(!lbls.includes('!='), 'Should NOT include != at expression start');
  });

  it('should NOT show = after constraint operator', () => {
    const lbls = labels(item('< '));
    assert.ok(!lbls.includes('='));
  });
});

describe('getCompletionItems — after comparison operator shows value items', () => {
  it('should include wildcard after = in refinement', () => {
    const text = '< 404684003 : 363698007 = ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('*'), 'Should include * (wildcard)');
  });

  it('should include constraint operators after = in refinement', () => {
    const text = '< 404684003 : 363698007 = ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(hasOperators(items), 'Should include constraint operators');
  });

  it('should include concept search after = in refinement', () => {
    const text = '< 404684003 : 363698007 = ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(hasSearch(items), 'Should include concept search');
  });
});

describe('getCompletionItems — after cardinality', () => {
  it('should include { } and R after cardinality', () => {
    const text = '< 404684003 : [1..*] ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('{ }'), 'Should include { } after cardinality');
    assert.ok(lbls.includes('R'), 'Should include R after cardinality');
  });

  it('should include constraint operators after cardinality', () => {
    const text = '< 404684003 : [0..1] ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(hasOperators(items));
  });
});

describe('getCompletionItems — filter block completions', () => {
  it('should show description filter keywords inside {{ D', () => {
    const text = '< 404684003 {{ D ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('term'), 'Should include "term"');
    assert.ok(lbls.includes('type'), 'Should include "type"');
    assert.ok(lbls.includes('active'), 'Should include "active"');
    assert.ok(lbls.includes('language'), 'Should include "language"');
  });

  it('should show concept filter keywords inside {{ C', () => {
    const text = '< 404684003 {{ C ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('definitionStatus'), 'Should include "definitionStatus"');
    assert.ok(lbls.includes('active'), 'Should include "active"');
  });

  it('should show member filter keywords inside {{ M', () => {
    const text = '< 404684003 {{ M ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('moduleId'), 'Should include "moduleId"');
    assert.ok(lbls.includes('active'), 'Should include "active"');
  });

  it('should show history completions inside {{ +', () => {
    const text = '< 404684003 {{ + ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('HISTORY }}'), 'Should include "HISTORY }}"');
    assert.ok(lbls.includes('HISTORY-MIN }}'), 'Should include "HISTORY-MIN }}"');
    assert.ok(lbls.includes('HISTORY-MOD }}'), 'Should include "HISTORY-MOD }}"');
    assert.ok(lbls.includes('HISTORY-MAX }}'), 'Should include "HISTORY-MAX }}"');
  });

  it('should show = and != after filter keyword', () => {
    const text = '< 404684003 {{ D term ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('='), 'Should include = after keyword');
    assert.ok(lbls.includes('!='), 'Should include != after keyword');
  });

  it('should show value tokens after type = in description filter', () => {
    const text = '< 404684003 {{ D type = ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('syn'), 'Should include "syn"');
    assert.ok(lbls.includes('fsn'), 'Should include "fsn"');
    assert.ok(lbls.includes('def'), 'Should include "def"');
  });

  it('should show boolean values after active = in description filter', () => {
    const text = '< 404684003 {{ D active = ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('true'), 'Should include "true"');
    assert.ok(lbls.includes('false'), 'Should include "false"');
  });

  it('should show definition status values after definitionStatus = in concept filter', () => {
    const text = '< 404684003 {{ C definitionStatus = ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('primitive'), 'Should include "primitive"');
    assert.ok(lbls.includes('defined'), 'Should include "defined"');
  });
});

describe('getCompletionItems — dotted expression', () => {
  it('should show constraint operators after dot', () => {
    const text = '< 404684003 . ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(hasOperators(items), 'Should include constraint operators after dot');
  });

  it('should show concept search after dot', () => {
    const text = '< 404684003 . ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(hasSearch(items), 'Should include concept search after dot');
  });

  it('should NOT show logical operators after dot', () => {
    const text = '< 404684003 . ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(!lbls.includes('AND'));
    assert.ok(!lbls.includes('OR'));
  });
});

// ── Keyword-aware filter completions ──────────────────────────────────────

describe('Keyword-aware filter completions', () => {
  it('should show typeId concept values after typeId =', () => {
    const text = '< 404684003 {{ D typeId = ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(
      lbls.some((l) => l.includes('900000000000003001')),
      'Should include FSN type ID',
    );
    assert.ok(
      lbls.some((l) => l.includes('900000000000013009')),
      'Should include Synonym type ID',
    );
  });

  it('should show description type values and typeId values after type =', () => {
    const text = '< 404684003 {{ D type = ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('syn'), 'Should include syn');
    assert.ok(lbls.includes('fsn'), 'Should include fsn');
    assert.ok(
      lbls.some((l) => l.includes('900000000000003001')),
      'Should include FSN type ID',
    );
  });

  it('should show dialect ID values after dialectId =', () => {
    const text = '< 404684003 {{ D dialectId = ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(
      lbls.some((l) => l.includes('900000000000509007')),
      'Should include US English dialect',
    );
    assert.ok(
      lbls.some((l) => l.includes('900000000000508004')),
      'Should include GB English dialect',
    );
  });

  it('should show module ID values after moduleId =', () => {
    const text = '< 404684003 {{ D moduleId = ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(
      lbls.some((l) => l.includes('900000000000207008')),
      'Should include SNOMED CT core module',
    );
  });

  it('should show definition status ID values after definitionStatusId =', () => {
    const text = '< 404684003 {{ C definitionStatusId = ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(
      lbls.some((l) => l.includes('900000000000074008')),
      'Should include Primitive',
    );
    assert.ok(
      lbls.some((l) => l.includes('900000000000073002')),
      'Should include Defined',
    );
  });

  it('should show boolean values after active =', () => {
    const text = '< 404684003 {{ D active = ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('true'), 'Should include true');
    assert.ok(lbls.includes('false'), 'Should include false');
  });

  it('should show date hint after effectiveTime =', () => {
    const text = '< 404684003 {{ D effectiveTime = ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(
      lbls.some((l) => l.includes('YYYYMMDD')),
      'Should include date format hint',
    );
  });

  it('should return empty for term = (free text)', () => {
    const text = '< 404684003 {{ D term = ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.strictEqual(items.length, 0, 'term = should return no static completions');
  });

  it('should return language code values after language =', () => {
    const text = '< 404684003 {{ D language = ';
    const items = getCompletionItems(true, text, text, text.length);
    const lbls = labels(items);
    assert.ok(lbls.includes('en'), 'Should include English');
    assert.ok(lbls.includes('es'), 'Should include Spanish');
    assert.ok(lbls.includes('fr'), 'Should include French');
    assert.ok(lbls.includes('de'), 'Should include German');
    assert.ok(lbls.includes('nl'), 'Should include Dutch');
    assert.ok(lbls.includes('sv'), 'Should include Swedish');
    assert.ok(lbls.includes('da'), 'Should include Danish');
    assert.ok(lbls.includes('no'), 'Should include Norwegian');
    assert.ok(lbls.includes('zh'), 'Should include Chinese');
    assert.ok(lbls.includes('ja'), 'Should include Japanese');
    assert.ok(lbls.includes('ko'), 'Should include Korean');
    assert.ok(lbls.includes('pt'), 'Should include Portuguese');
  });

  it('should return 12 language codes', () => {
    const text = '< 404684003 {{ D language = ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.strictEqual(items.length, 12, 'Should have 12 language codes');
  });

  it('should return empty for id = (free text)', () => {
    const text = '< 404684003 {{ D id = ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.strictEqual(items.length, 0, 'id = should return no static completions');
  });
});

// ═════════════════════════════════════════════════════════════════════
// DISPLAY TERM SUPPRESSION — no completions inside |...|
// ═════════════════════════════════════════════════════════════════════

describe('getCompletionItems — inside display term suppression', () => {
  it('should return no completions when cursor is inside a display term', () => {
    const text = '< 404684003 |Clinical find';
    const items = getCompletionItems(true, text, text, text.length);
    assert.strictEqual(items.length, 0, 'Should suppress completions inside display term');
  });

  it('should return no completions at start of display term (after opening pipe)', () => {
    const text = '< 404684003 |';
    const items = getCompletionItems(true, text, text, text.length);
    assert.strictEqual(items.length, 0, 'Should suppress completions right after opening pipe');
  });

  it('should return completions after a closed display term', () => {
    const text = '< 404684003 |Clinical finding| ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(items.length > 0, 'Should offer completions after closed display term');
  });

  it('should suppress inside attribute name display term', () => {
    const text = '< 404684003 : 363698007 |Finding s';
    const items = getCompletionItems(true, text, text, text.length);
    assert.strictEqual(items.length, 0, 'Should suppress completions inside attribute display term');
  });

  it('should not suppress when pipe is inside a block comment', () => {
    const text = '/* comment | value */\n< 404684003 ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(items.length > 0, 'Pipe in block comment should not count as display term');
  });

  it('should not suppress when pipe is inside a line comment', () => {
    const text = '// comment | value\n< 404684003 ';
    const items = getCompletionItems(true, text, text, text.length);
    assert.ok(items.length > 0, 'Pipe in line comment should not count as display term');
  });

  it('should suppress inside second display term on same line', () => {
    const text = '< 404684003 |Clinical finding| : 363698007 |Finding';
    const items = getCompletionItems(true, text, text, text.length);
    assert.strictEqual(items.length, 0, 'Should suppress inside second display term');
  });
});
