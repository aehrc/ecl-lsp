// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/** Configurable defaults that apply to every EclEditor nested within the provider. */
export interface EclEditorContextValue {
  /** Maximum number of concurrent in-flight FHIR requests. Default: 25 */
  maxConcurrency?: number;
}

const EclEditorContext = createContext<EclEditorContextValue>({});

export function useEclEditorContext(): EclEditorContextValue {
  return useContext(EclEditorContext);
}

export interface EclEditorProviderProps extends EclEditorContextValue {
  children: ReactNode;
}

/**
 * Provides default configuration for every EclEditor nested within.
 * Explicit props on EclEditor always take precedence over provider values.
 */
export function EclEditorProvider({ children, ...value }: Readonly<EclEditorProviderProps>) {
  return <EclEditorContext.Provider value={value}>{children}</EclEditorContext.Provider>;
}
