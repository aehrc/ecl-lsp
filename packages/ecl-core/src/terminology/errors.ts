// Copyright 2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

/**
 * Typed errors for terminology server failures.
 *
 * A failure to reach a terminology server is NOT a statement about SNOMED CT.
 * These types let callers tell the two apart structurally — by the `kind`
 * discriminant and the HTTP `status` — instead of parsing prose, so a socket
 * error is never rendered to a user (or an LLM) as "concept not found".
 */

/**
 * What went wrong.
 *
 * - `transport` — the request never produced an HTTP response: connection
 *   refused, DNS failure, TLS failure, timeout/abort, or an unreadable body.
 * - `http` — the server answered, but with an error status.
 */
export type TerminologyErrorKind = 'transport' | 'http';

/** Options common to all terminology errors. */
export interface TerminologyErrorOptions {
  /** The underlying failure (network error, abort error, parse error). */
  cause?: unknown;
  /** The request URL, when known. */
  url?: string;
}

/** Options for {@link TerminologyTransportError}. */
export interface TerminologyTransportErrorOptions extends TerminologyErrorOptions {
  /** True when the request was aborted because it exceeded its timeout. */
  timedOut?: boolean;
}

/** Options for {@link TerminologyHttpError}. */
export interface TerminologyHttpErrorOptions extends TerminologyErrorOptions {
  /** The HTTP status returned by the terminology server. */
  status: number;
  /** The HTTP reason phrase, when the client exposes one. */
  statusText?: string;
}

/**
 * Base class for terminology server failures.
 *
 * Never thrown directly — use {@link TerminologyTransportError} or
 * {@link TerminologyHttpError}, and discriminate on {@link kind}.
 */
export abstract class TerminologyError extends Error {
  /** Discriminant identifying the class of failure. */
  abstract readonly kind: TerminologyErrorKind;

  /**
   * The underlying failure.
   *
   * Declared explicitly (rather than relying on `Error.cause`) so it is part of
   * the emitted type declarations and is present on every runtime.
   */
  readonly cause: unknown;

  /** The request URL, when known. */
  readonly url: string | undefined;

  /** The HTTP status, present only on {@link TerminologyHttpError}. */
  readonly status: number | undefined;

  protected constructor(message: string, options: TerminologyErrorOptions & { status?: number } = {}) {
    super(message);
    this.name = 'TerminologyError';
    this.cause = options.cause;
    this.url = options.url;
    this.status = options.status;
  }
}

/**
 * The terminology server could not be reached, or produced no usable response.
 *
 * There is no HTTP status: the request never completed. Callers must treat this
 * as "unknown" — never as evidence that a concept is absent.
 */
export class TerminologyTransportError extends TerminologyError {
  readonly kind = 'transport' as const;

  /** True when the failure was a client-side timeout rather than a hard failure. */
  readonly timedOut: boolean;

  constructor(message: string, options: TerminologyTransportErrorOptions = {}) {
    super(message, options);
    this.name = 'TerminologyTransportError';
    this.timedOut = options.timedOut ?? false;
  }
}

/**
 * The terminology server answered with an error status.
 *
 * An error status is a statement about the request or the server, not about
 * SNOMED CT content — with the sole exception of a well-formed "unknown code"
 * response, which the service converts into `null` rather than an error.
 */
export class TerminologyHttpError extends TerminologyError {
  readonly kind = 'http' as const;

  /** The HTTP status returned by the server. Always present. */
  declare readonly status: number;

  /** The HTTP reason phrase, when the client exposes one. */
  readonly statusText: string | undefined;

  constructor(message: string, options: TerminologyHttpErrorOptions) {
    super(message, options);
    this.name = 'TerminologyHttpError';
    this.statusText = options.statusText;
  }
}

/**
 * True when `value` is a terminology failure.
 *
 * Checks structurally as well as by `instanceof`, so it still works when a dual
 * CJS/ESM build loads two copies of this module.
 */
export function isTerminologyError(value: unknown): value is TerminologyError {
  if (value instanceof TerminologyError) return true;
  if (!(value instanceof Error)) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    (value.name === 'TerminologyTransportError' && kind === 'transport') ||
    (value.name === 'TerminologyHttpError' && kind === 'http')
  );
}

/** True when `value` is a transport failure — the server was not reached. */
export function isTerminologyTransportError(value: unknown): value is TerminologyTransportError {
  return isTerminologyError(value) && value.kind === 'transport';
}

/** True when `value` is an HTTP error response from the terminology server. */
export function isTerminologyHttpError(value: unknown): value is TerminologyHttpError {
  return isTerminologyError(value) && value.kind === 'http';
}

/** True for the AbortError produced when a request exceeds its timeout. */
function isAbortLike(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/** Best-effort human-readable description of an unknown thrown value. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Wrap a network-level failure as a {@link TerminologyTransportError},
 * preserving the original as `cause`.
 */
export function toTransportError(
  error: unknown,
  options: { url?: string; operation: string; timeoutMs?: number },
): TerminologyTransportError {
  if (isTerminologyTransportError(error)) return error;

  const timedOut = isAbortLike(error);
  const after = options.timeoutMs === undefined ? '' : ` after ${options.timeoutMs}ms`;
  const reason = timedOut ? `timed out${after}` : `failed: ${describe(error)}`;

  return new TerminologyTransportError(`Could not reach the terminology server — ${options.operation} ${reason}`, {
    cause: error,
    url: options.url,
    timedOut,
  });
}

/**
 * Build a {@link TerminologyHttpError} for an error response, keeping any
 * detail the server supplied (e.g. an OperationOutcome diagnostic).
 */
export function toHttpError(options: {
  status: number;
  statusText?: string;
  url?: string;
  operation: string;
  detail?: string;
  cause?: unknown;
}): TerminologyHttpError {
  const suffix = options.detail ? `: ${options.detail}` : '';
  return new TerminologyHttpError(
    `Terminology server returned HTTP ${options.status} for ${options.operation}${suffix}`,
    options,
  );
}
