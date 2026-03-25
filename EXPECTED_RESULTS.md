# Expected Results - Quick Reference

This document shows the expected formatting results for quick verification.

## Test 1: Basic Formatting

**Before:**

```
<<  404684003|Clinical finding|
<404684003OR<19829001
```

**After:**

```
<< 404684003 | Clinical finding |
< 404684003 OR < 19829001
```

---

## Test 2: Indentation (with default indentSize=2)

**Before:**

```
< 404684003 {
363698007 = < 39057004,
116676008 = < 72704001
}
```

**After:**

```
< 404684003 {
  363698007 = < 39057004,
  116676008 = < 72704001
}
```

---

## Test 3: Line Breaking (with maxLineLength=80)

**Before:**

```
< 404684003 OR < 19829001 OR < 234567890 OR < 345678901 OR < 456789012
```

**After:**

```
< 404684003 OR < 19829001 OR < 234567890 OR < 345678901 OR
  < 456789012
```

_(Line breaks at operator, continuation indented)_

---

## Test 4: Term Alignment (with alignTerms=true)

**Before:**

```
< 404684003:
363698007 = < 39057004 |Short|,
116676008 = < 72704001 |Very long term|
```

**After:**

```
< 404684003:
363698007 = < 39057004         |Short|,
116676008 = < 72704001 |Very long term|
```

_(Pipes aligned vertically)_

---

## Test 5: Comment Preservation

**Before:**

```
/* Comment */
<<  404684003
/* Another */ <19829001
```

**After:**

```
/* Comment */
<< 404684003
/* Another */ < 19829001
```

_(Comments preserved, code formatted)_

---

## Test 6: Multi-Expression Files

**Before:**

```
<<  404684003

/* ECL-END */

<19829001OR<234567890
```

**After:**

```
<< 404684003

/* ECL-END */

< 19829001 OR < 234567890
```

_(Each expression formatted independently, delimiter preserved)_

---

## Configuration Changes

### indentSize=4:

```
< 404684003 {
    363698007 = < 39057004
}
```

_(4 spaces instead of 2)_

### indentStyle=tab:

```
< 404684003 {
→363698007 = < 39057004
}
```

_(Tab character instead of spaces)_

### spaceAroundOperators=false:

```
< 404684003OR< 19829001
```

_(No spaces around OR)_

### maxLineLength=40:

```
< 404684003 OR
  < 19829001 OR
  < 234567890
```

_(More aggressive line breaking)_

### alignTerms=false:

```
< 404684003:
363698007 = < 39057004 |Short|,
116676008 = < 72704001 |Very long term|
```

_(No alignment padding)_

---

## Range Formatting

**Before (entire file):**

```
<<  404684003
/* ECL-END */
<19829001OR<234567890
/* ECL-END */
< 404684003:363698007=<39057004
```

**After (selecting only line 3):**

```
<<  404684003
/* ECL-END */
< 19829001 OR < 234567890
/* ECL-END */
< 404684003:363698007=<39057004
```

_(Only selected expression formatted, others unchanged)_

---

## Error Handling

**Before:**

```
<<  404684003
this is invalid @#$%
<19829001OR<234567890
```

**After:**

```
<< 404684003
this is invalid @#$%
< 19829001 OR < 234567890
```

_(Valid expressions formatted, invalid ones unchanged)_
