/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */
import React from 'react';

const MockEditor = React.forwardRef((props: any, _ref: any) => {
  return (
    <div
      data-testid="monaco-editor"
      data-language={props.language}
      data-theme={props.theme}
      style={{ height: props.height, width: props.width }}
    >
      <textarea
        data-testid="monaco-textarea"
        value={props.value ?? props.defaultValue ?? ''}
        onChange={(e) => props.onChange?.(e.target.value)}
        readOnly={props.options?.readOnly}
      />
    </div>
  );
});
MockEditor.displayName = 'MockEditor';
export default MockEditor;
