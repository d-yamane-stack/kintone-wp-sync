'use strict';

/**
 * メール通知モジュール（Gmail App Password）
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.NOTIFY_EMAIL_FROM,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  tls: {
    // 企業プロキシの自己署名証明書を許容
    rejectUnauthorized: false,
  },
});

/**
 * メール送信
 * @param {object} opts { subject, text, html, attachments }
 */
async function sendMail(opts) {
  const info = await transporter.sendMail({
    from: `"RE-WRITE" <${process.env.NOTIFY_EMAIL_FROM}>`,
    to:   process.env.NOTIFY_EMAIL_TO,
    subject:     opts.subject,
    text:        opts.text        || '',
    html:        opts.html        || '',
    attachments: opts.attachments || [],
  });
  console.log('[Notify] メール送信: ' + info.messageId);
  return info;
}

/**
 * SEO順位変動アラートメール
 * @param {Array} alerts [{ keyword, siteId, prevPosition, newPosition }]
 */
async function sendRankAlert(alerts) {
  if (!alerts || alerts.length === 0) return;

  const rows = alerts.map(function(a) {
    const diff  = a.prevPosition - a.newPosition; // 正=上昇、負=下落
    const arrow = diff > 0 ? '▲' : '▼';
    const sign  = diff > 0 ? '+' : '';
    return `${arrow} ${a.keyword}（${a.siteId}）: ${a.prevPosition}位 → ${a.newPosition}位（${sign}${diff}）`;
  }).join('\n');

  const drops = alerts.filter(function(a) { return a.newPosition > a.prevPosition; });
  const rises = alerts.filter(function(a) { return a.newPosition < a.prevPosition; });

  const subject = `[SEO順位変動] ${drops.length}件下落 / ${rises.length}件上昇`;

  const html = `
<h2>SEO順位変動レポート</h2>
<p>前回比で順位が変動したキーワードをお知らせします。</p>
<pre style="font-family:monospace;background:#f5f5f5;padding:12px;">${rows}</pre>
<p style="color:#888;font-size:12px;">RE-WRITE 自動通知</p>
`;

  await sendMail({ subject, text: rows, html });
}

module.exports = { sendMail, sendRankAlert };
