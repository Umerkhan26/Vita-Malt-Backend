import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWelcomeEmailHtml } from '../src/utils/emailService';

test('welcome email template contains branded copy and CTA', () => {
  const html = buildWelcomeEmailHtml('Jane', 'https://vitamalt.com');

  assert.match(html, /Welcome to Vita Malt/i);
  assert.match(html, /Jane/i);
  assert.match(html, /Explore the campaign/i);
  assert.match(html, /https:\/\/vitamalt\.com/i);
});
