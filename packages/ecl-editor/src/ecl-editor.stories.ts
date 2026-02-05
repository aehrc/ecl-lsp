// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { html } from 'lit';
import type { Meta, StoryObj } from '@storybook/web-components-vite';
import './index'; // Auto-registers <ecl-editor>

const meta: Meta = {
  title: 'ECL Editor/ecl-editor',
  tags: ['autodocs'],
  argTypes: {
    value: { control: 'text' },
    theme: { control: 'select', options: ['vs', 'vs-dark', 'hc-black'] },
    height: { control: 'text' },
    'read-only': { control: 'boolean' },
    minimap: { control: 'boolean' },
    'line-numbers': { control: 'boolean' },
    'fhir-server-url': { control: 'text' },
    'snomed-version': { control: 'text' },
    'semantic-validation': { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  args: {
    value: '< 404684003 |Clinical finding|',
    theme: 'vs',
    height: '300px',
  },
  render: (args) => html` <ecl-editor value=${args.value} theme=${args.theme} height=${args.height}></ecl-editor> `,
};

export const DarkTheme: Story = {
  render: () => html`
    <ecl-editor
      value="<< 73211009 |Diabetes mellitus| : 363698007 |Finding site| = < 113331007 |Structure of endocrine system|"
      theme="vs-dark"
      height="300px"
    ></ecl-editor>
  `,
};

export const WithFhirServer: Story = {
  render: () => html`
    <ecl-editor
      value="< 404684003"
      fhir-server-url="https://tx.ontoserver.csiro.au/fhir"
      semantic-validation="true"
      height="400px"
    ></ecl-editor>
  `,
};

export const ReadOnly: Story = {
  render: () => html`
    <ecl-editor
      value="< 404684003 |Clinical finding| AND < 19829001 |Disorder of lung|"
      read-only
      height="200px"
    ></ecl-editor>
  `,
};

export const EventListening: Story = {
  render: () => {
    const container = document.createElement('div');

    const editorEl = document.createElement('ecl-editor');
    editorEl.setAttribute('value', '< 404684003');
    editorEl.setAttribute('height', '200px');
    container.appendChild(editorEl);

    const output = document.createElement('div');
    output.style.cssText = 'padding: 10px; font-family: monospace; font-size: 12px;';
    const header = document.createElement('div');
    header.textContent = 'Events will appear here:';
    header.style.fontWeight = 'bold';
    output.appendChild(header);
    container.appendChild(output);

    editorEl.addEventListener('ecl-change', ((e: CustomEvent) => {
      const line = document.createElement('div');
      const detail = e.detail as { value: string };
      line.textContent = `[change] ${detail.value.substring(0, 80)}...`;
      output.appendChild(line);
    }) as EventListener);

    editorEl.addEventListener('ecl-diagnostics', ((e: CustomEvent) => {
      const line = document.createElement('div');
      const detail = e.detail as { diagnostics: unknown[] };
      line.textContent = `[diagnostics] ${detail.diagnostics.length} issue(s)`;
      output.appendChild(line);
    }) as EventListener);

    return container;
  },
};

export const MultipleEditors: Story = {
  render: () => html`
    <div style="display: flex; gap: 10px; padding: 10px;">
      <ecl-editor value="< 404684003 |Clinical finding|" height="200px" width="50%"></ecl-editor>
      <ecl-editor value="< 19829001 |Disorder of lung|" theme="vs-dark" height="200px" width="50%"></ecl-editor>
    </div>
  `,
};
