// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/**
 * Detects if a cursor position in ECL syntax is valid for concept insertion.
 *
 * Valid concept positions occur after:
 * - Constraint operators: < << > >>
 * - Logical operators: AND OR MINUS
 * - Refinement separator: :
 * - Attribute value separator: =
 * - Start of line
 * - Opening parenthesis: (
 */

/**
 * Determines if the cursor position is valid for inserting a concept ID.
 *
 * @param line - The text of the current line
 * @param cursorPosition - The character position of the cursor (0-indexed)
 * @returns true if a concept ID can be inserted at this position
 */
export function isConceptPositionValid(line: string, cursorPosition: number): boolean {
  if (cursorPosition < 0) {
    return false;
  }

  // Get text before cursor (don't trim - we need to preserve trailing spaces)
  const textBeforeCursor = line.substring(0, cursorPosition);

  // Empty line or only whitespace - valid
  if (textBeforeCursor.trim().length === 0) {
    return true;
  }

  // Patterns that indicate a valid concept position
  // Note: We use \s* to allow optional whitespace before cursor
  const validPatterns = [
    /<<\s*$/, // Descendant-or-self operator
    /<\s*$/, // Descendant operator (must come after << to avoid matching it)
    />>\s*$/, // Ancestor-or-self operator
    />\s*$/, // Ancestor operator (must come after >> to avoid matching it)
    /\bAND\s*$/, // Logical AND (optional space allows triggering right after typing)
    /\bOR\s*$/, // Logical OR
    /\bMINUS\s*$/, // Logical MINUS
    /:\s*$/, // Refinement separator
    /=\s*$/, // Attribute value separator
    /\(\s*$/, // Opening parenthesis
  ];

  // Check if any pattern matches
  return validPatterns.some((pattern) => pattern.test(textBeforeCursor));
}

/**
 * Determines the priority/context for concept search in completion.
 *
 * @param line - The text of the current line
 * @param cursorPosition - The character position of the cursor
 * @returns 'high' if search should be prioritized, 'low' if operators should be prioritized
 */
export function getConceptSearchPriority(line: string, cursorPosition: number): 'high' | 'low' {
  const textBeforeCursor = line.substring(0, cursorPosition);

  // High priority (search first) after constraint operators
  const highPriorityPatterns = [/<<\s*$/, /<\s*$/, />>\s*$/, />\s*$/];

  if (highPriorityPatterns.some((pattern) => pattern.test(textBeforeCursor))) {
    return 'high';
  }

  // Low priority (operators first) at ambiguous positions
  // - Start of line or after opening paren (could be operator or concept)
  // - After logical operators (typically followed by new constraint with operator)
  return 'low';
}

/**
 * Determines which ECL operators are syntactically valid at the cursor position.
 * Uses regex pattern matching to analyze the context before the cursor.
 *
 * Context detection patterns:
 * 1. After complete constraint → logical operators (AND, OR, MINUS) + refinement (:)
 * 2. After constraint operator → no operators (concept expected)
 * 3. After logical operator → constraint operators (<, <<, >, >>)
 * 4. Start of expression → constraint operators
 * 5. After refinement/attribute operators → constraint operators
 * 6. Ambiguous context → all operators (fail open)
 *
 * @param line - The text of the current line
 * @param position - The character position of the cursor (0-indexed)
 * @returns Array of valid operator strings at this position
 */
export function getValidOperatorsAtPosition(line: string, position: number): string[] {
  // All possible operators
  const allOperators = ['AND', 'OR', 'MINUS', '<', '<<', '>', '>>', ':'];
  const logicalOperators = ['AND', 'OR', 'MINUS'];
  const constraintOperators = ['<', '<<', '>', '>>'];

  // Get text before cursor
  const textBeforeCursor = line.substring(0, position);

  // Context 1: After complete constraint (concept ID with optional term)
  // Pattern: SCTID (6-18 digits) followed by optional |term|, then whitespace
  // Example: "< 404684003 |Clinical finding| █"
  // Valid: logical operators and refinement separator
  if (/\d{6,18}(\s*\|[^|]*\|)?\s*$/.test(textBeforeCursor)) {
    return [...logicalOperators, ':'];
  }

  // Context 2: After constraint operator (< << > >>)

  // Special case 2a: After single < without space - allow completing to <<
  // Example: "AND <█"
  if (/(?<!<)<$/.test(textBeforeCursor)) {
    return ['<<'];
  }

  // Special case 2b: After single > without space - allow completing to >>
  // Example: "AND >█"
  if (/(?<!>)>$/.test(textBeforeCursor)) {
    return ['>>'];
  }

  // After complete constraint operator (with or without space) - concept expected, no operators
  // Example: "<<█" or "<< █" or "AND << █"
  // Valid: No operators (only concepts), return empty array
  if (/(<<|>>)$/.test(textBeforeCursor) || /(<<|<|>>|>)\s+$/.test(textBeforeCursor)) {
    return [];
  }

  // Context 3: After logical operator (AND OR MINUS)
  // Example: "< 404684003 AND █"
  // Valid: Only constraint operators to start new constraint
  if (/\b(AND|OR|MINUS)\s*$/.test(textBeforeCursor)) {
    return constraintOperators;
  }

  // Context 4: Start of expression (empty or only whitespace, or after opening paren)
  // Example: "█" or "(█"
  // Valid: Only constraint operators
  if (/^\s*$/.test(textBeforeCursor) || /\(\s*$/.test(textBeforeCursor)) {
    return constraintOperators;
  }

  // Context 5: After refinement separator (:)
  // Example: "< 404684003 : █"
  // Valid: Constraint operators (for attribute values)
  if (/:\s*$/.test(textBeforeCursor)) {
    return constraintOperators;
  }

  // Context 6: After attribute operator (=)
  // Example: "363698007 = █"
  // Valid: Constraint operators (for attribute values)
  if (/=\s*$/.test(textBeforeCursor)) {
    return constraintOperators;
  }

  // Context 7: Ambiguous or unrecognized context
  // Example: partial expressions, malformed syntax, complex patterns
  // Fail open - return all operators to avoid hiding valid options
  // Better to show extra options than to hide valid ones
  return allOperators;
}
