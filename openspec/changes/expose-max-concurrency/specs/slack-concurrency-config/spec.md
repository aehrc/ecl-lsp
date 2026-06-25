## ADDED Requirements

### Requirement: Slack bot config exposes maxConcurrency

The Slack bot's runtime config object SHALL include an optional `maxConcurrency?: number` field. When `FhirTerminologyService` is constructed per-request, the bot MUST pass `maxConcurrency` if it is set in config. If omitted, the service default of 5 applies.

#### Scenario: maxConcurrency set in bot config

- **WHEN** the bot is configured with `maxConcurrency: 2`
- **THEN** every `FhirTerminologyService` instance created during request handling uses `maxConcurrency: 2`

#### Scenario: maxConcurrency absent from bot config

- **WHEN** the bot config does not include `maxConcurrency`
- **THEN** `FhirTerminologyService` is constructed without the option and uses its default of 5

### Requirement: Slack bot reads maxConcurrency from environment variable

The bot MUST support configuring `maxConcurrency` via an environment variable (e.g. `ECL_MAX_CONCURRENCY`). If the environment variable is set to a valid positive integer, it MUST override the config-file value. If set to a non-integer or non-positive value, it SHALL be ignored with a startup warning.

#### Scenario: Environment variable set to valid integer

- **WHEN** `ECL_MAX_CONCURRENCY=8` is set in the environment
- **THEN** the bot config resolves `maxConcurrency` to `8` and passes it to the service

#### Scenario: Environment variable set to invalid value

- **WHEN** `ECL_MAX_CONCURRENCY=abc` is set in the environment
- **THEN** the variable is ignored, a warning is logged at startup, and the config-file or default value is used
