const jobsEl = document.getElementById('jobs');
const logsEl = document.getElementById('logs');
const runBtn = document.getElementById('runBtn');
const limitEl = document.getElementById('limit');
const recordIdEl = document.getElementById('recordId');

let selectedJobId = null;

async function request(url, options) {
  const res = await fetch(url, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function renderJobs(jobs) {
  jobsEl.innerHTML = '';
  jobs.forEach((job) => {
    const li = document.createElement('li');
    const label = job.params.recordId
      ? `ID:${job.params.recordId}`
      : `最新${job.params.limit}件`;
    li.innerHTML = `
      <button data-job-id="${job.id}">表示</button>
      <strong>${job.status}</strong>
      <span>${label}</span>
      <span>(${job.id.slice(0, 8)})</span>
    `;
    jobsEl.appendChild(li);
  });
}

async function loadJobs() {
  const data = await request('/api/jobs');
  renderJobs(data.jobs);
}

async function loadJob(jobId) {
  const data = await request('/api/jobs/' + jobId);
  const lines = data.logs.map((l) => `[${l.at}] ${l.line}`).join('\n');
  logsEl.textContent = lines || '(ログなし)';
}

jobsEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-job-id]');
  if (!btn) return;
  selectedJobId = btn.dataset.jobId;
  await loadJob(selectedJobId);
});

runBtn.addEventListener('click', async () => {
  try {
    const recordId = recordIdEl.value.trim();
    const limit = parseInt(limitEl.value, 10) || 3;
    const payload = recordId ? { recordId } : { limit };
    const result = await request('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    selectedJobId = result.jobId;
    await loadJobs();
    await loadJob(selectedJobId);
  } catch (err) {
    alert(err.message);
  }
});

setInterval(async () => {
  await loadJobs();
  if (selectedJobId) {
    await loadJob(selectedJobId);
  }
}, 3000);

loadJobs();
