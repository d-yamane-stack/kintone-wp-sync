require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const jobs = new Map();

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not Found' });
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function createJob(params) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const job = {
    id,
    status: 'queued',
    params,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    logs: [],
  };
  jobs.set(id, job);
  return job;
}

function appendLog(job, chunk) {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/).filter(Boolean);
  lines.forEach((line) => {
    job.logs.push({ at: new Date().toISOString(), line });
  });
  if (job.logs.length > 500) {
    job.logs = job.logs.slice(job.logs.length - 500);
  }
}

function startJob(job) {
  job.status = 'running';
  job.startedAt = new Date().toISOString();

  const args = ['index.js'];
  if (job.params.recordId) {
    args.push('--record-id', String(job.params.recordId));
  } else {
    args.push(String(job.params.limit || 3));
  }
  args.push('--yes');

  const child = spawn('node', args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => appendLog(job, chunk));
  child.stderr.on('data', (chunk) => appendLog(job, chunk));
  child.on('close', (code) => {
    job.exitCode = code;
    job.finishedAt = new Date().toISOString();
    job.status = code === 0 ? 'success' : 'failed';
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function listJobs() {
  return Array.from(jobs.values())
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((job) => ({
      id: job.id,
      status: job.status,
      params: job.params,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      exitCode: job.exitCode,
    }));
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && reqUrl.pathname === '/') {
    return serveFile(res, path.join(__dirname, 'public', 'index.html'), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && reqUrl.pathname === '/app.js') {
    return serveFile(res, path.join(__dirname, 'public', 'app.js'), 'application/javascript; charset=utf-8');
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/jobs') {
    return sendJson(res, 200, { jobs: listJobs() });
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/jobs') {
    try {
      const body = await parseBody(req);
      const recordId = body.recordId ? String(body.recordId).trim() : '';
      const limit = body.limit ? parseInt(body.limit, 10) : 3;
      if (recordId && !/^\d+$/.test(recordId)) {
        return sendJson(res, 400, { error: 'recordId must be numeric' });
      }
      if (!recordId && (!Number.isInteger(limit) || limit <= 0 || limit > 100)) {
        return sendJson(res, 400, { error: 'limit must be an integer between 1 and 100' });
      }

      const job = createJob({ recordId, limit });
      startJob(job);
      return sendJson(res, 201, { jobId: job.id });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  const matchJob = reqUrl.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)$/);
  if (req.method === 'GET' && matchJob) {
    const id = matchJob[1];
    const job = jobs.get(id);
    if (!job) return sendJson(res, 404, { error: 'job not found' });
    return sendJson(res, 200, {
      id: job.id,
      status: job.status,
      params: job.params,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      exitCode: job.exitCode,
      logs: job.logs,
    });
  }

  return sendJson(res, 404, { error: 'Not Found' });
});

server.listen(PORT, () => {
  console.log('Web app started: http://localhost:' + PORT);
});
