// Global singleton store for column analysis.
// Lives outside React components → persists across page navigation.

const WP_DOMAINS = { jube: 'jube.co.jp', nurube: 'nuribe.jp' };
const BATCH_SIZE  = 200;
const BATCH_DELAY = 4000; // ms between batches (rate-limit guard)

// ─── Storage helpers ──────────────────────────────────────────────────────────

function saveCache(siteId, data) {
  try {
    localStorage.setItem(`column-analysis-cache-${siteId}`,
      JSON.stringify({ ...data, cachedAt: Date.now() }));
  } catch {}
}

function loadCache(siteId) {
  try {
    const raw = localStorage.getItem(`column-analysis-cache-${siteId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function dropCache(siteId) {
  try { localStorage.removeItem(`column-analysis-cache-${siteId}`); } catch {}
}

// ─── Browser WP fetch ─────────────────────────────────────────────────────────

async function fetchWpPostsFromBrowser(siteId) {
  const domain = WP_DOMAINS[siteId];
  if (!domain) return [];
  const results = [];
  try {
    for (let page = 1; page <= 8; page++) {
      const res = await fetch(
        `https://${domain}/wp-json/wp/v2/column?per_page=100&page=${page}&status=publish&_fields=id,title,link,date,excerpt`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) break;
      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      results.push(...batch);
      if (batch.length < 100) break;
    }
  } catch (e) {
    console.warn('[AnalysisStore] WP fetch failed:', e.message);
  }
  return results;
}

// ─── Default state ────────────────────────────────────────────────────────────

const DEFAULT = {
  status:      'idle',   // idle | loading | analyzing | done | error
  loadingStep: '',
  posts:       [],
  gscData:     [],
  ga4Data:     [],
  analysis:    null,
  error:       '',
  gscError:    '',
  cacheInfo:   null,
};

// ─── Store class ──────────────────────────────────────────────────────────────

class AnalysisStore {
  constructor() {
    this._states           = {};   // siteId → state
    this._listeners        = new Set();
    this._hydrated         = false;
    this._activeStatesSnap = {};   // stable reference for useSyncExternalStore
  }

  /** Load initial data from localStorage (called lazily on first read) */
  _hydrate() {
    if (this._hydrated) return;
    this._hydrated = true;
    ['jube', 'nurube'].forEach(siteId => {
      if (this._states[siteId]) return;
      try {
        const c = loadCache(siteId);
        if (c?.posts) {
          this._states[siteId] = {
            ...DEFAULT,
            status:    'done',
            posts:     c.posts    || [],
            gscData:   c.gscData  || [],
            ga4Data:   c.ga4Data  || [],
            analysis:  c.analysis || null,
            cacheInfo: { cachedAt: c.cachedAt, postCount: (c.posts || []).length },
          };
        }
      } catch {}
    });
    this._rebuildActiveSnap();
  }

  /** Rebuild the stable active-states snapshot (called on every state change) */
  _rebuildActiveSnap() {
    const next = {};
    Object.entries(this._states).forEach(([k, s]) => {
      if (s.status !== 'idle') next[k] = s;
    });
    this._activeStatesSnap = next;
  }

  /** Stable reference per siteId — no { ...DEFAULT } spread on every call */
  getState(siteId) {
    if (typeof window !== 'undefined') this._hydrate();
    return this._states[siteId] || DEFAULT;
  }

  /** Stable reference rebuilt only on _notify() — safe for useSyncExternalStore */
  getActiveStates() {
    if (typeof window !== 'undefined') this._hydrate();
    return this._activeStatesSnap;
  }

  _set(siteId, partial) {
    this._states[siteId] = { ...(this._states[siteId] || DEFAULT), ...partial };
    this._rebuildActiveSnap();
    this._notify();
  }

  _notify() { this._listeners.forEach(fn => fn()); }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  clearCache(siteId) {
    dropCache(siteId);
    this._states[siteId] = { ...DEFAULT };
    this._notify();
  }

  async runAnalysis(siteId) {
    const cur = this.getState(siteId);
    if (cur.status === 'loading' || cur.status === 'analyzing') return; // already running

    this._set(siteId, {
      status: 'loading', loadingStep: '記事データとGSCデータを取得中…',
      error: '', gscError: '', posts: [], gscData: [], ga4Data: [], analysis: null, cacheInfo: null,
    });

    try {
      // ── Step 1: posts + GSC + GA4 ──────────────────────────────────────────
      const [postsRes, gscRes, ga4Res] = await Promise.all([
        fetch(`/api/column-analysis/posts?siteId=${siteId}`),
        fetch(`/api/column-analysis/gsc?siteId=${siteId}`),
        fetch(`/api/column-analysis/ga4?siteId=${siteId}`),
      ]);
      const [postsData, gscResult, ga4Result] = await Promise.all([
        postsRes.json(), gscRes.json(), ga4Res.json(),
      ]);

      if (!postsData.success) {
        this._set(siteId, { status: 'error', error: postsData.error || '記事取得に失敗しました' });
        return;
      }

      const fetchedPosts = postsData.posts || [];
      const fetchedGsc   = gscResult.success ? (gscResult.data || []) : [];
      const fetchedGa4   = ga4Result.success  ? (ga4Result.data  || []) : [];

      let gscError = '';
      if (!gscResult.success) {
        gscError = gscResult.error || 'GSCデータ取得失敗';
      } else if (gscResult.hint) {
        gscError = `${gscResult.hint}（取得: ${gscResult.total}件 / GSC全体: ${gscResult.rawTotal || 0}件）`;
      }

      // ── Step 2: WP direct fetch ────────────────────────────────────────────
      this._set(siteId, { loadingStep: 'WPサイトから既存コラムを取得中…' });
      const wpRaw  = await fetchWpPostsFromBrowser(siteId);
      const dbUrls = new Set(fetchedPosts.filter(p => p.url).map(p => p.url));
      const wpExtra = wpRaw
        .filter(wp => !dbUrls.has(wp.link))
        .map(wp => ({
          id:      `wp-${wp.id}`,
          title:   wp.title?.rendered || '',
          url:     wp.link || '',
          date:    wp.date || '',
          excerpt: (wp.excerpt?.rendered || '').replace(/<[^>]*>/g, '').trim().slice(0, 300),
          status:  'wp-published',
          keyword: '',
          source:  'wp',
        }));
      const allPosts = [...fetchedPosts, ...wpExtra];
      console.log(`[AnalysisStore] ${siteId}: DB:${fetchedPosts.length} + WP:${wpExtra.length} = ${allPosts.length}`);

      this._set(siteId, {
        posts: allPosts, gscData: fetchedGsc, ga4Data: fetchedGa4, gscError,
        cacheInfo: { cachedAt: Date.now(), postCount: allPosts.length },
      });
      saveCache(siteId, { posts: allPosts, gscData: fetchedGsc, ga4Data: fetchedGa4, analysis: null });

      // ── Step 3: AI analysis in batches ─────────────────────────────────────
      const postsForAI = allPosts.map(p => ({ id: p.id, title: p.title, date: p.date }));
      const batches = [];
      for (let i = 0; i < postsForAI.length; i += BATCH_SIZE) {
        batches.push(postsForAI.slice(i, i + BATCH_SIZE));
      }

      let allCategories = [];
      let lastResult    = null;

      for (let b = 0; b < batches.length; b++) {
        const from = b * BATCH_SIZE + 1;
        const to   = Math.min((b + 1) * BATCH_SIZE, postsForAI.length);

        if (b > 0) {
          this._set(siteId, { status: 'analyzing', loadingStep: `AIが記事を分析中…（${from}〜${to}件目 / 全${postsForAI.length}件）待機中…` });
          await new Promise(r => setTimeout(r, BATCH_DELAY));
        }
        this._set(siteId, { status: 'analyzing', loadingStep: `AIが記事を分析中…（${from}〜${to}件目 / 全${postsForAI.length}件）` });

        let retries = 2, data;
        while (retries >= 0) {
          const res  = await fetch('/api/column-analysis/analyze', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteId, posts: batches[b], seoKeywords: [] }),
          });
          const text = await res.text();
          try { data = JSON.parse(text); }
          catch { throw new Error(`AI分析エラー（バッチ${b + 1}）: ${text.slice(0, 120)}`); }

          if (!data.success && data.error?.includes('429') && retries > 0) {
            retries--;
            this._set(siteId, { loadingStep: `APIレート制限 → 10秒後にリトライ（バッチ${b + 1}/${batches.length}）` });
            await new Promise(r => setTimeout(r, 10000));
            continue;
          }
          break;
        }

        if (!data.success) throw new Error(data.error || `AI分析に失敗しました（バッチ${b + 1}）`);
        allCategories = [...allCategories, ...(data.result?.articleCategories || [])];
        lastResult    = data.result;
      }

      const mergedResult = { ...lastResult, articleCategories: allCategories };
      this._set(siteId, {
        status: 'done', analysis: mergedResult, loadingStep: '',
        cacheInfo: { cachedAt: Date.now(), postCount: allPosts.length },
      });
      saveCache(siteId, { posts: allPosts, gscData: fetchedGsc, ga4Data: fetchedGa4, analysis: mergedResult });

    } catch (err) {
      this._set(siteId, { status: 'error', error: '通信エラーが発生しました: ' + err.message, loadingStep: '' });
    }
  }
}

// ─── Singleton (survives hot-reload in dev via window) ────────────────────────
const KEY = '__rw_analysis_store__';
export const analysisStore =
  typeof window !== 'undefined'
    ? (window[KEY] || (window[KEY] = new AnalysisStore()))
    : new AnalysisStore();
