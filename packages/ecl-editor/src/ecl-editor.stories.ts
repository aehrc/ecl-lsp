// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { html } from 'lit';
import type { Meta, StoryObj } from '@storybook/web-components-vite';
import './index'; // Auto-registers <ecl-editor>

const meta: Meta = {
  title: 'ECL Editor/ecl-editor',
  tags: ['autodocs'],
  argTypes: {
    value: { control: 'text' },
    theme: { control: 'select', options: ['auto', 'vs', 'vs-dark', 'hc-black', 'hc-light'] },
    'light-theme': { control: 'text' },
    'dark-theme': { control: 'text' },
    height: { control: 'text' },
    'read-only': { control: 'boolean' },
    minimap: { control: 'boolean' },
    gutter: { control: 'select', options: ['full', 'minimal', 'none'] },
    'line-numbers': { control: 'select', options: ['on', 'off', 'relative', 'interval'] },
    'glyph-margin': { control: 'boolean' },
    folding: { control: 'boolean' },
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

/**
 * `theme="auto"` follows the OS colour scheme and switches live when it
 * changes — try toggling your system appearance with this story open.
 */
export const AutoTheme: Story = {
  render: () => html`
    <ecl-editor
      value="<< 73211009 |Diabetes mellitus| : 363698007 |Finding site| = < 113331007 |Structure of endocrine system|"
      theme="auto"
      height="300px"
    ></ecl-editor>
  `,
};

/** `auto` can drive custom themes too, via `light-theme`/`dark-theme`. */
export const AutoThemeHighContrast: Story = {
  render: () => html`
    <ecl-editor
      value="< 404684003 |Clinical finding|"
      theme="auto"
      light-theme="hc-light"
      dark-theme="hc-black"
      height="300px"
    ></ecl-editor>
  `,
};

/**
 * The three gutter presets side by side. `none` reclaims the whole left margin,
 * which is what an embedder wants for a compact single-expression input.
 */
export const GutterPresets: Story = {
  render: () => html`
    <div style="display:flex;flex-direction:column;gap:16px;padding:10px;">
      <div>
        <div style="font:12px system-ui;margin-bottom:4px;">gutter="full" (default)</div>
        <ecl-editor value="< 404684003 |Clinical finding|" gutter="full" height="120px"></ecl-editor>
      </div>
      <div>
        <div style="font:12px system-ui;margin-bottom:4px;">
          gutter="minimal" — no line numbers, lightbulb still shown
        </div>
        <ecl-editor value="< 404684003 |Clinical finding|" gutter="minimal" height="120px"></ecl-editor>
      </div>
      <div>
        <div style="font:12px system-ui;margin-bottom:4px;">gutter="none" — no left margin at all</div>
        <ecl-editor value="< 404684003 |Clinical finding|" gutter="none" height="120px"></ecl-editor>
      </div>
    </div>
  `,
};

/** Individual attributes override whatever the preset chose. */
export const GutterOverrides: Story = {
  render: () => html`
    <ecl-editor
      value="<< 73211009 |Diabetes mellitus| : 363698007 |Finding site| = < 113331007 |Structure of endocrine system|"
      gutter="none"
      line-numbers="relative"
      height="200px"
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
