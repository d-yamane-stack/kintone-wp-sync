'use strict';

require('dotenv').config();

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
    // ---- POST /api/jobs/case-study ----
    if (method === 'POST' && url === '/api/jobs/case-study') {
      const body       = await readBody();
      const siteId     = body.siteId || 'jube';
      const limit      = parseInt(body.limit || '3', 10);
      const siteConfig = getSiteConfig(siteId);

      const dbJob = await createJob({
        siteId:        siteConfig.siteId,
        siteName:      siteConfig.siteName,
        wpBaseUrl:     siteConfig.wordpress.baseUrl     || '',
        wpUsername:    siteConfig.wordpress.username    || '',
        wpAppPassword: siteConfig.wordpress.appPassword || '',
        wpPostType:    siteConfig.wordpress.postType    || 'post',
        jobType:   'case_study',
        meta:      { limit: limit },
      });

      const qJob = await getContentJobQueue().add('case_study', {
        type:    'case_study',
        siteId:  siteConfig.siteId,
        limit:   limit,
        dbJobId: dbJob.id,
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
        },
      });

      const qJob = await getContentJobQueue().add('column', {
        type:     'column',
        siteId:   siteConfig.siteId,
        keyword:  body.keyword,
        audience: body.audience || '一般のお客様',
        tone:     body.tone     || '親しみやすく丁寧',
        cta:      body.cta      || '無料相談はこちら',
        dbJobId:  dbJob.id,
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
