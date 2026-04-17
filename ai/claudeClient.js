'use strict';

const { CONFIG } = require('../config');
const { httpRequest } = require('../lib/http');

/**
 * @param {object} data - extractRecordData の返り値
 * @param {object} siteConfig - sites/siteConfigs.js の1サイト設定
 */
async function expandTextWithClaude(data, siteConfig) {
  const promptKey = (siteConfig && siteConfig.promptKey) || 'reform';
  const { buildPrompt } = require('./prompts/' + promptKey);
  const prompt = buildPrompt(data);

  const response = await httpRequest({
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'x-api-key': CONFIG.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
  }, {
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find(function(c) { return c.type === 'text'; });
  if (!textContent) throw new Error('Claude APIからテキストが返されませんでした');
  try {
    return JSON.parse(textContent.text.replace(/```json|```/g, '').trim());
  } catch (e) {
    throw new Error('Claude APIレスポンスのパース失敗: ' + textContent.text);
  }
}

module.exports = { expandTextWithClaude };
