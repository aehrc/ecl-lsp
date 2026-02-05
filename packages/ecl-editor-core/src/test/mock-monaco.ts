// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/**
 * Minimal Monaco API mocks for unit testing outside the browser.
 *
 * These provide just enough surface area to drive the Monaco adapter functions
 * that live in src/monaco/*.ts.
 */

export class MockPosition {
  constructor(
    public readonly lineNumber: number,
    public readonly column: number,
  ) {}
}

export class MockRange {
  constructor(
    public readonly startLineNumber: number,
    public readonly startColumn: number,
    public readonly endLineNumber: number,
    public readonly endColumn: number,
  ) {}
}

export interface MockUri {
  toString(): string;
}

export interface MockTextModel {
  uri: MockUri;
  getValue(): string;
  getLineContent(lineNumber: number): string;
  getLineCount(): number;
  getOffsetAt(position: MockPosition): number;
  getWordUntilPosition(position: MockPosition): { word: string; startColumn: number; endColumn: number };
  getFullModelRange(): MockRange;
  getValueInRange(range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }): string;
  getLanguageId(): string;
}

/**
 * Create a mock ITextModel from a string of ECL text.
 */
export function createMockModel(text: string, uri = 'file:///test.ecl'): MockTextModel {
  const lines = text.split('\n');

  return {
    uri: { toString: () => uri },

    getValue(): string {
      return text;
    },

    getLineContent(lineNumber: number): string {
      return lines[lineNumber - 1] ?? '';
    },

    getLineCount(): number {
      return lines.length;
    },

    getOffsetAt(position: MockPosition): number {
      let offset = 0;
      for (let i = 0; i < position.lineNumber - 1 && i < lines.length; i++) {
        offset += lines[i].length + 1; // +1 for newline
      }
      offset += position.column - 1;
      return offset;
    },

    getWordUntilPosition(position: MockPosition): { word: string; startColumn: number; endColumn: number } {
      const lineText = lines[position.lineNumber - 1] ?? '';
      const col = position.column - 1; // 0-based
      // Walk backwards from cursor to find word start
      let start = col;
      while (start > 0 && /\w/.test(lineText[start - 1])) {
        start--;
      }
      const word = lineText.substring(start, col);
      return {
        word,
        startColumn: start + 1, // back to 1-based
        endColumn: position.column,
      };
    },

    getFullModelRange(): MockRange {
      const lastLine = lines.length;
      const lastCol = (lines[lastLine - 1]?.length ?? 0) + 1;
      return new MockRange(1, 1, lastLine, lastCol);
    },

    getValueInRange(range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    }): string {
      if (range.startLineNumber === range.endLineNumber) {
        const line = lines[range.startLineNumber - 1] ?? '';
        return line.substring(range.startColumn - 1, range.endColumn - 1);
      }
      const result: string[] = [];
      for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
        const line = lines[i - 1] ?? '';
        if (i === range.startLineNumber) {
          result.push(line.substring(range.startColumn - 1));
        } else if (i === range.endLineNumber) {
          result.push(line.substring(0, range.endColumn - 1));
        } else {
          result.push(line);
        }
      }
      return result.join('\n');
    },

    getLanguageId(): string {
      return 'ecl';
    },
  };
}
