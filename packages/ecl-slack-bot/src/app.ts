// Copyright 2024-2026 Commonwealth Scientific and Industrial Research Organisation (CSIRO)
// ABN 41 687 119 230. SPDX-License-Identifier: Apache-2.0

import 'dotenv/config';
import { App } from '@slack/bolt';
import { FhirTerminologyService } from 'ecl-core';
import { loadConfig, resolveEdition, formatResolvedVersion } from './config';
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

// ── Helpers ──────────────────────────────────────────────────────────────

/** Slack HTML-encodes angle brackets in event text (but not slash command text). */
function unescapeSlackHtml(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// ── Shared handler logic ────────────────────────────────────────────────

async function handleEcl(raw: string): Promise<{ text: string; isHelp: boolean; isError: boolean }> {
  const start = Date.now();
  const parsed = parseInput(raw);

  if (parsed.help) {
    return { text: buildHelpMessage(), isHelp: true, isError: false };
  }

  if (parsed.error) {
    return { text: `:red_circle: ${parsed.error}`, isHelp: false, isError: true };
  }

  const eclPreview = parsed.ecl.length > 80 ? parsed.ecl.slice(0, 80) + '...' : parsed.ecl;
  console.log(`[ECL] Processing: ${eclPreview}`);

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

  const terminologyService = new FhirTerminologyService({
    baseUrl: config.fhirServerUrl,
    timeout: 10_000, // 10s timeout — bot users expect a few seconds of latency
    userAgent: 'ecl-slack-bot/1.0.0',
    snomedVersion: snomedEdition,
  });

  const result = await processEcl(parsed.ecl, terminologyService, {
    evaluate: parsed.evaluate,
    edition: editionLabel,
    maxEvalResults: config.maxEvalResults,
  });

  // Use the actual resolved version from the FHIR response when available
  const resolvedVersion = terminologyService.getResolvedVersion();
  if (resolvedVersion) {
    result.edition = formatResolvedVersion(resolvedVersion);
    result.editionUri = resolvedVersion;
    result.fhirServerUrl = config.fhirServerUrl;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[ECL] Done in ${elapsed}s — ${result.errors.length} errors, ${result.warnings.length} warnings`);

  return { text: buildMessage(result), isHelp: false, isError: false };
}

// ── Slash command: /ecl ─────────────────────────────────────────────────

app.command('/ecl', async ({ command, ack, respond }) => {
  await ack();
  console.log(`[ECL] /ecl command from ${command.user_name}`);
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
  console.log(`[ECL] @mention raw event.text:`, JSON.stringify(event.text));
  // Strip the bot mention and unescape HTML entities Slack injects into event text
  const raw = unescapeSlackHtml(event.text.replace(/<@\w+>/gi, '').trim());
  console.log(`[ECL] @mention after stripping:`, JSON.stringify(raw).slice(0, 200));
  try {
    const { text } = await handleEcl(raw);
    await say({ text, thread_ts: event.ts });
  } catch (error) {
    console.error('Error handling @mention:', error);
    await say({ text: ':red_circle: An unexpected error occurred.', thread_ts: event.ts });
  }
});

// ── Direct messages ─────────────────────────────────────────────────────

app.message(async ({ message, say }) => {
  // Only handle direct messages (im channel type)
  if (message.channel_type !== 'im') return;
  // Ignore bot messages to prevent loops
  if (message.subtype === 'bot_message' || ('bot_id' in message && message.bot_id)) return;

  const raw = unescapeSlackHtml(('text' in message && message.text) || ''); // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing -- expression yields string|false
  console.log(`[ECL] DM from ${('user' in message && message.user) || 'unknown'}`);
  try {
    const { text } = await handleEcl(raw);
    await say(text);
  } catch (error) {
    console.error('Error handling DM:', error);
    await say(':red_circle: An unexpected error occurred.');
  }
});

// ── Start ───────────────────────────────────────────────────────────────

void (async () => {
  await app.start();
  console.log('ECL Slack Bot is running');
})();
