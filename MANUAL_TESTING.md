# Manual Testing Guide for ECL Formatter

This guide provides step-by-step instructions to manually test the ECL formatter in VS Code.

## Prerequisites

1. Open this project in VS Code
2. Press F5 to launch the Extension Development Host
3. In the Extension Development Host, open the `examples/` folder

## Test 1: Basic Formatting

**Test file:** `examples/test-1-basic.ecl`

**Steps:**

1. Open `examples/test-1-basic.ecl`
2. Verify the language mode shows "ECL" in the bottom-right corner
3. Press `Shift+Option+F` (Mac) or `Shift+Alt+F` (Windows/Linux) to format

**Expected Result:**

- Constraint operators have single space after: `<<` → `<< `
- Logical operators have spaces around: `OR` → `OR`
- Terms have single space padding: `|term|` → `| term |`
- Concept IDs followed by terms have single space: `404684003|term|` → `404684003 | term |`

---

## Test 2: Indentation

**Test file:** `examples/test-2-indentation.ecl`

**Steps:**

1. Open `examples/test-2-indentation.ecl`
2. Format the document (`Shift+Option+F`)

**Expected Result:**

- Content inside `{ }` should be indented by 2 spaces (default)
- Nested blocks should have increased indentation
- Closing braces should align with opening line

---

## Test 3: Line Breaking

**Test file:** `examples/test-3-linebreaking.ecl`

**Steps:**

1. Open `examples/test-3-linebreaking.ecl`
2. Format the document
3. Observe how long lines are broken

**Expected Result:**

- Lines longer than 80 characters should break at logical operators (AND, OR, MINUS)
- Continuation lines should be indented
- Terms should not break mid-word

---

## Test 4: Term Alignment

**Test file:** `examples/test-4-alignment.ecl`

**Steps:**

1. Open `examples/test-4-alignment.ecl`
2. Format the document

**Expected Result:**

- In multi-attribute refinements, the `|` characters should align vertically
- Single-attribute refinements should not have extra spacing

---

## Test 5: Comment Preservation

**Test file:** `examples/test-5-comments.ecl`

**Steps:**

1. Open `examples/test-5-comments.ecl`
2. Format the document

**Expected Result:**

- All comments should be preserved
- Comments before expressions should remain before
- Inline comments should be preserved
- `/* ECL-END */` delimiters should remain as-is

---

## Test 6: Multi-Expression Files

**Test file:** `examples/test-6-multiexpr.ecl`

**Steps:**

1. Open `examples/test-6-multiexpr.ecl`
2. Format the document

**Expected Result:**

- Each expression separated by `/* ECL-END */` should be formatted independently
- Delimiters should have blank lines before and after
- All expressions should be normalized

---

## Test 7: Range Formatting

**Test file:** `examples/test-7-range.ecl`

**Steps:**

1. Open `examples/test-7-range.ecl`
2. Select only the second expression (lines with `< 19829001`)
3. Right-click → Format Selection (or `Cmd+K Cmd+F` on Mac)

**Expected Result:**

- Only the selected expression should be formatted
- Other expressions should remain unchanged
- Selection expands to complete expression boundaries

---

## Test 8: Configuration - Indent Size

**Steps:**

1. Open `examples/test-2-indentation.ecl`
2. Open VS Code Settings (Cmd+, or Ctrl+,)
3. Search for "ecl.formatting.indentSize"
4. Change value to `4`
5. Format the document

**Expected Result:**

- Content inside `{ }` should now be indented by 4 spaces
- After testing, change back to `2`

---

## Test 9: Configuration - Indent Style (Tabs)

**Steps:**

1. Open `examples/test-2-indentation.ecl`
2. Open VS Code Settings
3. Search for "ecl.formatting.indentStyle"
4. Change value to `tab`
5. Format the document

**Expected Result:**

- Content inside `{ }` should be indented with tabs
- After testing, change back to `space`

---

## Test 10: Configuration - Operator Spacing

**Steps:**

1. Open `examples/test-1-basic.ecl`
2. Open VS Code Settings
3. Search for "ecl.formatting.spaceAroundOperators"
4. Uncheck the box (set to `false`)
5. Format the document

**Expected Result:**

- Logical operators should have no spaces: `OR` → `OR`
- Constraint operators should still have space after them
- After testing, check the box again (set to `true`)

---

## Test 11: Configuration - Max Line Length

**Steps:**

1. Open `examples/test-3-linebreaking.ecl`
2. Open VS Code Settings
3. Search for "ecl.formatting.maxLineLength"
4. Change value to `40`
5. Format the document

**Expected Result:**

- Lines should break much earlier (at ~40 characters)
- More lines should be created
- After testing, change back to `80` or `0` (unlimited)

---

## Test 12: Configuration - Term Alignment

**Steps:**

1. Open `examples/test-4-alignment.ecl`
2. Open VS Code Settings
3. Search for "ecl.formatting.alignTerms"
4. Uncheck the box (set to `false`)
5. Format the document

**Expected Result:**

- Terms should NOT be aligned vertically
- No extra spaces before `|` characters
- After testing, check the box again (set to `true`)

---

## Test 13: Format on Save

**Steps:**

1. Open VS Code Settings
2. Search for "editor.formatOnSave"
3. Check the box to enable
4. Open any test file
5. Make a small change (add a space)
6. Save the file (Cmd+S or Ctrl+S)

**Expected Result:**

- File should be automatically formatted on save
- Changes should be applied immediately

---

## Test 14: Output Panel (Debugging)

**Steps:**

1. Open the Output panel: View → Output (Cmd+Shift+U)
2. Select "ECL Language Server" from the dropdown
3. Open any test file and format it

**Expected Result:**

- You should see log messages like:
  - "Format document requested for: ..."
  - "Using formatting options: {...}"
  - "Found X expressions"
  - "Format complete"

---

## Test 15: Error Handling

**Test file:** `examples/test-15-errors.ecl`

**Steps:**

1. Open `examples/test-15-errors.ecl`
2. Format the document

**Expected Result:**

- Invalid/unparseable expressions should return unchanged
- No crashes or errors
- Valid parts should still be formatted (in multi-expression files)

---

## Verification Checklist

After completing all tests, verify:

- [ ] Basic formatting works (operators, terms, spacing)
- [ ] Indentation works with blocks `{ }`
- [ ] Long lines break at operators
- [ ] Multi-attribute terms align vertically
- [ ] Comments are preserved
- [ ] Multi-expression files work with `/* ECL-END */`
- [ ] Range formatting works (format selection)
- [ ] Indent size configuration works (2, 4)
- [ ] Indent style configuration works (space, tab)
- [ ] Operator spacing configuration works (true/false)
- [ ] Max line length configuration works (80, 40, 0)
- [ ] Term alignment configuration works (true/false)
- [ ] Format on save works
- [ ] Output panel shows debug logs
- [ ] Error handling works gracefully

---

## Troubleshooting

**Formatting doesn't do anything:**

- Check language mode is "ECL" (bottom-right corner)
- Check Output panel for errors
- Try reloading the Extension Development Host (Cmd+R)

**Configuration changes don't apply:**

- Reload the Extension Development Host window
- Check settings.json for correct values
- Verify setting names match exactly

**Unexpected formatting:**

- Check your configuration settings
- Review Output panel for what options are being used
- Verify test file has valid ECL syntax
