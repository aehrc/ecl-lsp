// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import 'dotenv/config';
import { App } from '@slack/bolt';
import { FhirTerminologyService } from 'ecl-core';
import { loadConfig, resolveEdition } from './config';
import { parseInput, processEcl } from './ecl-processor';
import { buildMessage, buildHelpMessage } from './message-builder';

const config = loadConfig();

if (!config.slackBotToken || !config.slackAppToken) {
  console.error('Missing SLACK_BOT_TOKEN or SLACK_APP_TOKEN environment variables');
  process.exit(1);
}

const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  socketMode: true,
});

// ── Shared handler logic ────────────────────────────────────────────────

async function handleEcl(raw: string): Promise<{ text: string; isHelp: boolean; isError: boolean }> {
  const parsed = parseInput(raw);

  if (parsed.help) {
    return { text: buildHelpMessage(), isHelp: true, isError: false };
  }

  if (parsed.error) {
    return { text: `:red_circle: ${parsed.error}`, isHelp: false, isError: true };
  }

  // Resolve edition
  let snomedEdition = config.snomedEdition;
  let editionLabel = snomedEdition ?? 'Server default';

  if (parsed.edition) {
    const resolved = resolveEdition(parsed.edition);
    if (!resolved) {
      return {
        text: `:red_circle: Unknown edition: \`${parsed.edition}\`. Use one of: int, au, us, uk, nz, or a full URI.`,
        isHelp: false,
        isError: true,
      };
    }
    snomedEdition = resolved;
    editionLabel = `${parsed.edition} (${resolved})`;
  }

  const terminologyService = new FhirTerminologyService(
    config.fhirServerUrl,
    2000,
    'ecl-slack-bot/1.0.0',
    snomedEdition,
  );

  const result = await processEcl(parsed.ecl, terminologyService, {
    evaluate: parsed.evaluate,
    edition: editionLabel,
  });

  return { text: buildMessage(result), isHelp: false, isError: false };
}

// ── Slash command: /ecl ─────────────────────────────────────────────────

app.command('/ecl', async ({ command, ack, respond }) => {
  await ack();
  try {
    const { text } = await handleEcl(command.text);
    await respond({ text, response_type: 'ephemeral' });
  } catch (error) {
    console.error('Error handling /ecl command:', error);
    await respond({ text: ':red_circle: An unexpected error occurred.', response_type: 'ephemeral' });
  }
});

// ── @mention ────────────────────────────────────────────────────────────

app.event('app_mention', async ({ event, say }) => {
  // Strip the bot mention from the text
  const raw = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  try {
    const { text } = await handleEcl(raw);
    await say({ text, thread_ts: event.ts });
  } catch (error) {
    console.error('Error handling @mention:', error);
    await say({ text: ':red_circle: An unexpected error occurred.', thread_ts: event.ts });
  }
});

// ── Start ───────────────────────────────────────────────────────────────

(async () => {
  await app.start();
  console.log('ECL Slack Bot is running');
})();
