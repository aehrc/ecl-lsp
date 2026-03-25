# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Email:** ontoserver-support@csiro.au

**What to include:**

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

We will acknowledge receipt within 3 business days and aim to provide an initial assessment within 10 business days.

## Scope

This project is a developer tool for writing SNOMED CT ECL expressions. The primary security surface is:

- **FHIR server URL configuration** — the `ecl.terminology.serverUrl` setting controls which server receives terminology requests. Users should only configure trusted FHIR endpoints.
- **No credentials stored** — the tool does not store or transmit authentication credentials. FHIR requests are unauthenticated.
- **No code execution** — ECL expressions are parsed and validated but never executed as code.
