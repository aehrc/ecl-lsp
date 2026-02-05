// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

export { formatDocument } from './formatter';
export type { FormattingOptions } from './options';
export { defaultFormattingOptions } from './options';
export { validateIndentSize, validateIndentStyle, validateMaxLineLength, validateBoolean } from './config';
export { expandToExpressionBoundaries, getExpressionsInRange, formatRangeExpressions } from './range';
