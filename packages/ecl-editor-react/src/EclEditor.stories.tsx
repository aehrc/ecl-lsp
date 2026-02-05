import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EclEditor } from './EclEditor';
import { useEclEditor } from './useEclEditor';

const meta: Meta<typeof EclEditor> = {
  title: 'ECL Editor/EclEditor',
  component: EclEditor,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    theme: {
      control: 'select',
      options: ['vs', 'vs-dark', 'hc-black'],
    },
    height: { control: 'text' },
    readOnly: { control: 'boolean' },
    minimap: { control: 'boolean' },
    lineNumbers: { control: 'boolean' },
    semanticValidation: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof EclEditor>;

export const Default: Story = {
  args: {
    defaultValue: '< 404684003 |Clinical finding|',
    height: '300px',
    theme: 'vs',
  },
};

export const DarkTheme: Story = {
  args: {
    defaultValue:
      '<< 73211009 |Diabetes mellitus| : 363698007 |Finding site| = < 113331007 |Structure of endocrine system|',
    height: '300px',
    theme: 'vs-dark',
  },
};

export const WithFhirServer: Story = {
  args: {
    defaultValue: '< 404684003',
    fhirServerUrl: 'https://tx.ontoserver.csiro.au/fhir',
    semanticValidation: true,
    height: '400px',
  },
};

export const ReadOnly: Story = {
  args: {
    value: '< 404684003 |Clinical finding| AND < 19829001 |Disorder of lung|',
    readOnly: true,
    height: '200px',
  },
};

export const MultiLineExpression: Story = {
  args: {
    defaultValue: `/* Diabetes with specific finding sites */
<< 73211009 |Diabetes mellitus| :
  363698007 |Finding site| = < 113331007 |Structure of endocrine system|,
  116676008 |Associated morphology| = << 52988006 |Lesion|

/* ECL-END */

/* Medication concepts */
< 763158003 |Medicinal product|`,
    height: '400px',
  },
};

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState('< 404684003');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '20px' }}>
        <EclEditor value={value} onChange={setValue} height="200px" />
        <div>
          <strong>Current value:</strong>
          <pre style={{ background: '#f5f5f5', padding: '10px', fontSize: '12px' }}>{value}</pre>
        </div>
        <button
          onClick={() => {
            setValue('< 19829001 |Disorder of lung|');
          }}
        >
          Set to Lung Disorder
        </button>
      </div>
    );
  },
};

export const WithHook: Story = {
  render: () => {
    const editor = useEclEditor({
      initialValue: '<< 404684003 |Clinical finding|',
    });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '20px' }}>
        <EclEditor
          value={editor.value}
          onChange={editor.onChange}
          onDiagnostics={editor.onDiagnostics}
          height="200px"
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              editor.format();
            }}
          >
            Format
          </button>
          <button
            onClick={() => {
              editor.setValue('< 19829001');
            }}
          >
            Reset
          </button>
        </div>
        <div>
          <strong>Diagnostics ({editor.diagnostics.length}):</strong>
          <ul style={{ fontSize: '12px' }}>
            {editor.diagnostics.map((d, i) => (
              <li key={i}>
                [{d.severity}] {d.message}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  },
};

export const NoLineNumbers: Story = {
  args: {
    defaultValue: '< 404684003',
    lineNumbers: false,
    minimap: false,
    height: '200px',
  },
};
