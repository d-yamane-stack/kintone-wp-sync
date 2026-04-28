'use strict';

require('dotenv').config({ override: true });

const http   = require('http');
const { getContentJobQueue } = require('./queue/index');
const { createJob, finishJob, listRecentJobs } = require('./db/repositories/jobRepo');
const { getSiteConfig, SITE_CONFIGS } = require('./sites/siteConfigs');
const { disconnectPrisma } = require('./db/client');

const PORT = parseInt(process.env.PORT || '3000', 10);

// -------------------------------------------------------
// 簡易ルーター（Expressなし — 依存を増やさない）
// -------------------------------------------------------
async function router(req, res) {
  const url    = req.url.split('?')[0];
  const method = req.method;

  // JSON ボディ読み込み
  async function readBody() {
    return new Promise(function(resolve) {
      var body = '';
      req.on('data', function(chunk) { body += chunk; });
      req.on('end', function() {
        try { resolve(JSON.parse(body || '{}')); }
        catch (e) { resolve({}); }
      });
    });
  }

  function json(statusCode, data) {
    const payload = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type':  'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  try {
    // ---- GET /api/kintone/records — 最新20件プレビュー (?siteId=jube|nurube) ----
    if (method === 'GET' && url.startsWith('/api/kintone/records')) {
      const qs = req.url.includes('?') ? new URLSearchParams(req.url.split('?')[1]) : null;
      const siteIdParam = qs ? (qs.get('siteId') || 'jube') : 'jube';
      const { getKintoneRecordsPreview, getNurubeKintoneRecordsPreview } = require('./sources/kintone');
      let records;
      if (siteIdParam === 'nurube') {
        records = await getNurubeKintoneRecordsPreview(20);
      } else {
        records = await getKintoneRecordsPreview(20);
      }
      return json(200, { success: true, records: records });
    }

    // ---- POST /api/jobs/case-study ----
    if (method === 'POST' && url === '/api/jobs/case-study') {
      const body       = await readBody();
      const siteId     = body.siteId || 'jube';
      const siteConfig = getSiteConfig(siteId);

      // recordIds（選択したレコードID）が指定された場合はそちらを優先
      const recordIds = Array.isArray(body.recordIds) && body.recordIds.length > 0 ? body.recordIds : null;
      const limit     = recordIds ? recordIds.length : parseInt(body.limit || '3', 10);

      const dbJob = await createJob({
        siteId:        siteConfig.siteId,
        siteName:      siteConfig.siteName,
        wpBaseUrl:     siteConfig.wordpress.baseUrl     || '',
        wpUsername:    siteConfig.wordpress.username    || '',
        wpAppPassword: siteConfig.wordpress.appPassword || '',
        wpPostType:    siteConfig.wordpress.postType    || 'post',
        jobType:   'case_study',
        meta:      { limit: limit, recordIds: recordIds, costUsd: 0.04 * limit },
      });

      const qJob = await getContentJobQueue().add('case_study', {
        type:      'case_study',
        siteId:    siteConfig.siteId,
        limit:     limit,
        recordIds: recordIds,
        dbJobId:   dbJob.id,
      });

      return json(200, {
        success:    true,
        dbJobId:    dbJob.id,
        queueJobId: qJob.id,
        message:    '施工事例ジョブをキューに登録しました',
      });
    }

    // ---- POST /api/jobs/column ----
    if (method === 'POST' && url === '/api/jobs/column') {
      const body = await readBody();
      if (!body.keyword) {
        return json(400, { success: false, error: 'keyword は必須です' });
      }

      const siteId     = body.siteId || 'jube';
      const siteConfig = getSiteConfig(siteId);

      const dbJob = await createJob({
        siteId:        siteConfig.siteId,
        siteName:      siteConfig.siteName,
        wpBaseUrl:     siteConfig.wordpress.baseUrl     || '',
        wpUsername:    siteConfig.wordpress.username    || '',
        wpAppPassword: siteConfig.wordpress.appPassword || '',
        wpPostType:    siteConfig.wordpress.postType    || 'post',
        jobType:   'column',
        meta:      {
          keyword:  body.keyword,
          audience: body.audience || '一般のお客様',
          tone:     body.tone     || '親しみやすく丁寧',
          cta:      body.cta      || '無料相談はこちら',
          costUsd:  0.07, // 概算コストを記録（削除後も集計に使用）
        },
      });

      const qJob = await getContentJobQueue().add('column', {
        type:        'column',
        siteId:      siteConfig.siteId,
        keyword:     body.keyword,
        directTitle: body.directTitle || false,
        audience:    body.audience || '一般のお客様',
        tone:        body.tone     || '親しみやすく丁寧',
        cta:         body.cta      || '無料相談はこちら',
        dbJobId:     dbJob.id,
      }, {
        attempts: 2, // コラムはAPI代が高いので再試行は2回まで
      });

      return json(200, {
        success:    true,
        dbJobId:    dbJob.id,
        queueJobId: qJob.id,
        message:    'コラム生成ジョブをキューに登録しました',
      });
    }

    // ---- GET /api/jobs ----
    if (method === 'GET' && url === '/api/jobs') {
      const jobs = await listRecentJobs(20);
      return json(200, { success: true, jobs: jobs });
    }

    // ---- GET /api/sites ----
    if (method === 'GET' && url === '/api/sites') {
      const sites = Object.keys(SITE_CONFIGS).map(function(id) {
        return { siteId: id, siteName: SITE_CONFIGS[id].siteName };
      });
      return json(200, { success: true, sites: sites });
    }

    // ---- POST /api/keywords/recommend ----
    // { siteId, recentKeywords: ["keyword1", ...] }
    if (method === 'POST' && url === '/api/keywords/recommend') {
      const body = await readBody();
      const siteId = body.siteId || 'jube';
      const siteConfig = getSiteConfig(siteId);
      const recentKeywords = Array.isArray(body.recentKeywords) ? body.recentKeywords : [];
      const { httpRequest: req } = require('./lib/http');

      const now = new Date();
      const month = now.getMonth() + 1;

      // 現在の季節
      var currentSeason = month >= 3 && month <= 5 ? '春'
                        : month >= 6 && month <= 8 ? '夏'
                        : month >= 9 && month <= 11 ? '秋'
                        : '冬';

      // 2〜3ヶ月先の季節・需要テーマ（公開タイミングを考慮）
      var futureMonth = ((month - 1 + 2) % 12) + 1; // 2ヶ月後
      var futureSeason = futureMonth >= 3 && futureMonth <= 5
        ? '春（梅雨前：湿気・カビ・外壁メンテナンス需要）'
        : futureMonth >= 6 && futureMonth <= 8
        ? '初夏〜梅雨（カビ・湿気・換気・浴室・水回りトラブル需要）'
        : futureMonth >= 9 && futureMonth <= 11
        ? '秋（台風後点検・冬支度：窓・外壁・断熱準備需要）'
        : '冬（寒さ対策・断熱・浴室・ヒートショック・結露需要）';

      const usedStr = recentKeywords.length > 0
        ? '最近使用済み（重複を避けること）:\n' + recentKeywords.map(function(k) { return '- ' + k; }).join('\n')
        : '';

      const rec = siteConfig.recommendConfig || {};
      const siteDesc   = rec.siteDescription || siteConfig.siteName;
      const consultant = rec.consultant      || 'リフォーム・住宅会社のSEO・AIOコンサルタント';
      const focusAreas = rec.focusAreas      || 'リフォーム全般';
      const excludeStr = rec.excludeAreas && rec.excludeAreas !== 'none' && rec.excludeAreas !== 'なし'
        ? '- 【除外】次のトピックは絶対に含めないこと: ' + rec.excludeAreas + '\n'
        : '';

      const prompt = 'あなたは' + consultant + 'です。\n'
        + 'サイト: ' + siteConfig.siteName + '（' + siteDesc + '）\n'
        + '現在: ' + now.getFullYear() + '年' + month + '月（' + currentSeason + '）\n'
        + '公開タイミングを考慮した2〜3ヶ月先の需要テーマ: ' + futureSeason + '\n'
        + usedStr + '\n\n'
        + '以下の条件でSEOコラムのターゲットキーワードを8個提案してください:\n'
        + '【形式】2〜3語の組み合わせキーワードのみ（コラムタイトルではなく検索キーワード形式）\n'
        + '  良い例: "キッチン リフォーム 補助金"、"お風呂 カビ 対策"、"窓 結露 解消"\n'
        + '  悪い例: "知らないと損！浴室断熱リフォームで光熱費を節約する方法" （タイトルになっている）\n'
        + '【必須条件】\n'
        + '- 2〜3ヶ月先の季節・需要を見越したキーワードを優先すること\n'
        + '- 地名（千葉・茨城・柏・水戸など都市名・県名）は含めないこと\n'
        + '- 「費用」「料金」「値段」「価格」はなるべく避けること（補助金・節約・助成金は可）\n'
        + '- このサイトの専門領域を必ず含める: ' + focusAreas + '\n'
        + excludeStr
        + '- 補助金・節約・DIY・選び方・比較など実用的テーマも含める\n'
        + '- 通年で検索されるキーワードか、これからの季節に合ったキーワードにすること\n\n'
        + 'JSON形式のみで返答（コードブロック不要）:\n'
        + '{"keywords":["キーワード1","キーワード2","キーワード3","キーワード4","キーワード5","キーワード6","キーワード7","キーワード8"]}';

      const resp = await req({
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }, {
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = resp.content && resp.content[0] && resp.content[0].text || '';
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        return json(200, { success: true, keywords: parsed.keywords || [] });
      } catch (e) {
        return json(200, { success: true, keywords: [] });
      }
    }

    // ---- POST /api/jobs/sync-wp ----
    // Vercel(海外IP)から直接WPを叩くとXSERVERにブロックされるため、
    // ローカルIPで動くworker.jsにジョブを委譲する。
    if (method === 'POST' && url === '/api/jobs/sync-wp') {
      const qJob = await getContentJobQueue().add('sync_wp', {
        type: 'sync_wp',
      }, {
        attempts:         1,
        removeOnComplete: 10,
        removeOnFail:     10,
      });
      return json(200, {
        success:    true,
        queueJobId: qJob.id,
        message:    'WP同期ジョブをworkerに送信しました。数秒後にページを更新すると反映されます。',
      });
    }

    // ---- GET /api/health ----
    if (method === 'GET' && url === '/api/health') {
      return json(200, { success: true, status: 'ok' });
    }

    return json(404, { success: false, error: 'Not Found' });

  } catch (err) {
    console.error('[Server] エラー: ' + err.message);
    return json(500, { success: false, error: err.message });
  }
}

// -------------------------------------------------------
// サーバー起動
// -------------------------------------------------------
const server = http.createServer(router);

server.listen(PORT, function() {
  console.log('[Server] 起動完了 http://localhost:' + PORT);
  console.log('[Server] エンドポイント:');
  console.log('  POST /api/jobs/case-study  { siteId, limit }');
  console.log('  POST /api/jobs/column      { siteId, keyword, audience, tone, cta }');
  console.log('  GET  /api/jobs');
  console.log('  GET  /api/sites');
  console.log('  GET  /api/health');
});

// -------------------------------------------------------
// グレースフルシャットダウン
// -------------------------------------------------------
async function shutdown() {
  console.log('[Server] シャットダウン中...');
  server.close(async function() {
    await disconnectPrisma();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

module.exports = server;
