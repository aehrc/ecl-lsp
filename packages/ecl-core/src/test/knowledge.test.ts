// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  allArticles,
  getArticle,
  getArticlesByCategory,
  getOperatorHoverDoc,
  knowledgeGuides,
  getGuide,
  operatorHoverDocs,
} from '../knowledge';

describe('Knowledge Module', () => {
  describe('allArticles', () => {
    it('should contain articles from all categories', () => {
      const categories = new Set(allArticles.map((a) => a.category));
      assert.ok(categories.has('operator'), 'should have operator articles');
      assert.ok(categories.has('refinement'), 'should have refinement articles');
      assert.ok(categories.has('filter'), 'should have filter articles');
      assert.ok(categories.has('pattern'), 'should have pattern articles');
      assert.ok(categories.has('grammar'), 'should have grammar articles');
      assert.ok(categories.has('history'), 'should have history articles');
    });

    it('should have unique IDs for all articles', () => {
      const ids = allArticles.map((a) => a.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(ids.length, uniqueIds.size, 'all article IDs should be unique');
    });

    it('every article should have required fields', () => {
      for (const article of allArticles) {
        assert.ok(article.id, `article should have an id`);
        assert.ok(article.category, `article ${article.id} should have a category`);
        assert.ok(article.name, `article ${article.id} should have a name`);
        assert.ok(article.summary, `article ${article.id} should have a summary`);
        assert.ok(article.content, `article ${article.id} should have content`);
        assert.ok(Array.isArray(article.examples), `article ${article.id} should have examples array`);
        assert.ok(Array.isArray(article.related), `article ${article.id} should have related array`);
      }
    });

    it('related references should point to existing articles', () => {
      const idSet = new Set(allArticles.map((a) => a.id));
      for (const article of allArticles) {
        for (const relatedId of article.related) {
          assert.ok(
            idSet.has(relatedId),
            `article ${article.id} references non-existent related article: ${relatedId}`,
          );
        }
      }
    });
  });

  describe('getArticle', () => {
    it('should return an article by ID', () => {
      const article = getArticle('op:descendantOf');
      assert.ok(article);
      assert.strictEqual(article.name, 'Descendant Of (<)');
    });

    it('should return undefined for unknown ID', () => {
      assert.strictEqual(getArticle('nonexistent'), undefined);
    });
  });

  describe('getArticlesByCategory', () => {
    it('should return all operator articles', () => {
      const operators = getArticlesByCategory('operator');
      assert.ok(operators.length >= 15, 'should have at least 15 operator articles');
      assert.ok(operators.every((a) => a.category === 'operator'));
    });

    it('should return all refinement articles', () => {
      const refinements = getArticlesByCategory('refinement');
      assert.ok(refinements.length >= 5, 'should have at least 5 refinement articles');
    });

    it('should return all filter articles', () => {
      const filters = getArticlesByCategory('filter');
      assert.ok(filters.length >= 3, 'should have at least 3 filter articles');
    });

    it('should return all pattern articles', () => {
      const patterns = getArticlesByCategory('pattern');
      assert.ok(patterns.length >= 8, 'should have at least 8 pattern articles');
    });

    it('should return empty array for unknown category', () => {
      assert.deepStrictEqual(getArticlesByCategory('nonexistent'), []);
    });
  });

  describe('operatorHoverDocs', () => {
    it('should include all constraint operators', () => {
      const operators = operatorHoverDocs.map((d) => d.operator);
      assert.ok(operators.includes('<'), 'should have <');
      assert.ok(operators.includes('<<'), 'should have <<');
      assert.ok(operators.includes('<!'), 'should have <!');
      assert.ok(operators.includes('<<!'), 'should have <<!');
      assert.ok(operators.includes('>'), 'should have >');
      assert.ok(operators.includes('>>'), 'should have >>');
      assert.ok(operators.includes('>!'), 'should have >!');
      assert.ok(operators.includes('>>!'), 'should have >>!');
      assert.ok(operators.includes('^'), 'should have ^');
      assert.ok(operators.includes('!!>'), 'should have !!>');
      assert.ok(operators.includes('!!<'), 'should have !!<');
    });

    it('should include logical operators', () => {
      const operators = operatorHoverDocs.map((d) => d.operator);
      assert.ok(operators.includes('AND'), 'should have AND');
      assert.ok(operators.includes('OR'), 'should have OR');
      assert.ok(operators.includes('MINUS'), 'should have MINUS');
    });

    it('should include refinement colon', () => {
      const operators = operatorHoverDocs.map((d) => d.operator);
      assert.ok(operators.includes(':'), 'should have :');
    });

    it('each hover doc should have markdown content', () => {
      for (const doc of operatorHoverDocs) {
        assert.ok(doc.markdown.length > 0, `hover doc for ${doc.operator} should have markdown`);
        assert.ok(doc.markdown.includes('**'), `hover doc for ${doc.operator} should have bold text`);
      }
    });
  });

  describe('getOperatorHoverDoc', () => {
    it('should return hover doc for symbol operators', () => {
      const doc = getOperatorHoverDoc('<');
      assert.ok(doc);
      assert.ok(doc.includes('Descendant Of'));
    });

    it('should return hover doc for multi-char operators', () => {
      assert.ok(getOperatorHoverDoc('<<')?.includes('Descendant Or Self'));
      assert.ok(getOperatorHoverDoc('<!')?.includes('Child Of'));
      assert.ok(getOperatorHoverDoc('>>!')?.includes('Parent Or Self'));
    });

    it('should return hover doc for keyword operators (case-insensitive)', () => {
      assert.ok(getOperatorHoverDoc('AND')?.includes('AND'));
      assert.ok(getOperatorHoverDoc('and')?.includes('AND'));
      assert.ok(getOperatorHoverDoc('Or')?.includes('OR'));
      assert.ok(getOperatorHoverDoc('MINUS')?.includes('MINUS'));
      assert.ok(getOperatorHoverDoc('minus')?.includes('MINUS'));
    });

    it('should return undefined for unknown operators', () => {
      assert.strictEqual(getOperatorHoverDoc('UNKNOWN'), undefined);
      assert.strictEqual(getOperatorHoverDoc(''), undefined);
    });
  });

  describe('knowledgeGuides', () => {
    it('should have all 6 guides', () => {
      assert.strictEqual(knowledgeGuides.length, 6);
    });

    const expectedGuides = [
      { uri: 'ecl://guide/operators', name: 'ECL Operators Guide' },
      { uri: 'ecl://guide/refinements', name: 'ECL Refinements Guide' },
      { uri: 'ecl://guide/filters', name: 'ECL Filters Guide' },
      { uri: 'ecl://guide/patterns', name: 'ECL Patterns Guide' },
      { uri: 'ecl://reference/grammar', name: 'ECL Grammar Reference' },
      { uri: 'ecl://guide/history-supplements', name: 'ECL History Supplements Guide' },
    ];

    for (const expected of expectedGuides) {
      it(`should have guide: ${expected.name}`, () => {
        const guide = knowledgeGuides.find((g) => g.uri === expected.uri);
        assert.ok(guide, `guide ${expected.uri} should exist`);
        assert.strictEqual(guide.name, expected.name);
        assert.ok(guide.description.length > 0, 'should have description');
        assert.ok(guide.content.length > 0, 'should have content');
      });
    }

    it('operators guide should mention all constraint operators', () => {
      const guide = getGuide('ecl://guide/operators');
      assert.ok(guide);
      assert.ok(guide.content.includes('Descendant Of'), 'should mention Descendant Of');
      assert.ok(guide.content.includes('Ancestor Of'), 'should mention Ancestor Of');
      assert.ok(guide.content.includes('Member Of'), 'should mention Member Of');
      assert.ok(guide.content.includes('AND'), 'should mention AND');
      assert.ok(guide.content.includes('OR'), 'should mention OR');
      assert.ok(guide.content.includes('MINUS'), 'should mention MINUS');
    });

    it('patterns guide should include common ECL patterns', () => {
      const guide = getGuide('ecl://guide/patterns');
      assert.ok(guide);
      assert.ok(guide.content.includes('Disorders by Body Site'), 'should mention disorders by site');
      assert.ok(guide.content.includes('Medications'), 'should mention medications');
      assert.ok(guide.content.includes('Procedures'), 'should mention procedures');
    });

    it('refinements guide should cover groups and cardinality', () => {
      const guide = getGuide('ecl://guide/refinements');
      assert.ok(guide);
      assert.ok(guide.content.includes('Attribute Groups'), 'should mention attribute groups');
      assert.ok(guide.content.includes('Cardinality'), 'should mention cardinality');
      assert.ok(guide.content.includes('Reverse'), 'should mention reverse');
    });

    it('filters guide should cover all three filter types', () => {
      const guide = getGuide('ecl://guide/filters');
      assert.ok(guide);
      assert.ok(guide.content.includes('{{ D }}'), 'should mention description filters');
      assert.ok(guide.content.includes('{{ C }}'), 'should mention concept filters');
      assert.ok(guide.content.includes('{{ M }}'), 'should mention member filters');
    });

    it('history guide should cover all profiles', () => {
      const guide = getGuide('ecl://guide/history-supplements');
      assert.ok(guide);
      assert.ok(guide.content.includes('HISTORY-MIN'), 'should mention HISTORY-MIN');
      assert.ok(guide.content.includes('HISTORY-MOD'), 'should mention HISTORY-MOD');
      assert.ok(guide.content.includes('HISTORY-MAX'), 'should mention HISTORY-MAX');
    });
  });

  describe('getGuide', () => {
    it('should return a guide by URI', () => {
      const guide = getGuide('ecl://guide/operators');
      assert.ok(guide);
      assert.strictEqual(guide.name, 'ECL Operators Guide');
    });

    it('should return undefined for unknown URI', () => {
      assert.strictEqual(getGuide('ecl://unknown'), undefined);
    });
  });
});
