/* eslint-disable */
import React, { useState, useEffect, useCallback, useRef } from 'react';

type DateRestrict = 'd3' | 'w1' | 'w2' | 'm1';
type TabType = 'results' | 'blacklisted' | 'history';

interface AnnotatedResult {
  url: string;
  title: string;
  description: string;
  fetchedAt: string;
  status: 'new' | 'duplicate' | 'blacklisted';
}

interface Stats {
  total: number;
  new: number;
  duplicate: number;
  blacklisted: number;
}

interface HistoryItem {
  query: string;
  url: string;
  title: string;
  fetchedAt: string;
}

const API = '/.netlify/functions/search';

const DATE_OPTIONS: { label: string; value: DateRestrict }[] = [
  { label: '直近3日', value: 'd3' },
  { label: '直近1週間', value: 'w1' },
  { label: '直近2週間', value: 'w2' },
  { label: '直近1ヶ月', value: 'm1' },
];

const COUNT_OPTIONS = [
  { label: '無制限', value: 0 },
  { label: '10件', value: 10 },
  { label: '20件', value: 20 },
  { label: '30件', value: 30 },
  { label: '50件', value: 50 },
];

// ドメイン文字列を正規化（プロトコル・末尾スラッシュを除去）
function normalizeDomain(raw: string): string {
  return raw.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export default function SearchScraper() {
  const [query, setQuery] = useState('');
  const [dateRestrict, setDateRestrict] = useState<DateRestrict>('w1');
  const [maxResults, setMaxResults] = useState(0); // 無制限がデフォルト
  const [deduplication, setDeduplication] = useState(true);

  const [results, setResults] = useState<AnnotatedResult[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // モーダル状態
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState('');
  const [modalTotal, setModalTotal] = useState(0);
  const [modalDone, setModalDone] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const abortRef = useRef(false);

  // ブラックリスト
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [blInput, setBlInput] = useState('');
  const blFileRef = useRef<HTMLInputElement>(null);

  // 対象ドメイン
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState('');
  const domainFileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<TabType>('results');
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const fetchBlacklist = useCallback(async () => {
    const res = await fetch(`${API}?action=blacklist`);
    const data = await res.json();
    setBlacklist(data.blacklist ?? []);
  }, []);

  const fetchDomains = useCallback(async () => {
    const res = await fetch(`${API}?action=domains`);
    const data = await res.json();
    setDomains(data.domains ?? []);
  }, []);

  useEffect(() => {
    fetchBlacklist();
    fetchDomains();
  }, [fetchBlacklist, fetchDomains]);

  // ---- 検索実行 ----
  // 検索クエリのリストを作成して順番にページループ
  async function handleSearch() {
    if (!query.trim()) return;

    abortRef.current = false;
    setModalOpen(true);
    setModalStatus('');
    setModalTotal(0);
    setModalDone(false);
    setModalError(null);
    setError(null);

    // 検索するクエリ一覧：ドメインあり → ドメインなし
    const searchTargets: { searchQuery: string; label: string }[] = [
      ...domains.map((d) => ({
        searchQuery: `${query} site:${normalizeDomain(d)}`,
        label: `site:${normalizeDomain(d)}`,
      })),
      { searchQuery: query, label: 'キーワードのみ' },
    ];

    // 全リクエストの結果をURL単位でマージ（重複排除）
    const allRawByUrl = new Map<string, AnnotatedResult>();
    const unlimited = maxResults === 0;

    try {
      for (let ti = 0; ti < searchTargets.length; ti++) {
        if (abortRef.current) break;

        const target = searchTargets[ti];
        let page = 1;

        while (true) {
          if (abortRef.current) break;

          setModalStatus(`[${ti + 1}/${searchTargets.length}] ${target.label} — ${page}ページ目`);

          const isLastTarget = ti === searchTargets.length - 1;
          const isLastPage = false; // 最終判定はフロント側でまとめて行う

          const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              searchQuery: target.searchQuery,
              dateRestrict,
              page,
              deduplication: false, // フロントで一括処理するため個別保存はしない
              isLast: false,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? '検索に失敗しました');

          const pageResults: AnnotatedResult[] = data.results ?? [];

          // URLでマージ（先着優先）
          for (const r of pageResults) {
            if (!allRawByUrl.has(r.url)) {
              allRawByUrl.set(r.url, r);
            }
          }

          setModalTotal(allRawByUrl.size);

          if (!data.hasMore) break;
          if (!unlimited && allRawByUrl.size >= maxResults) break;

          page++;
          await new Promise((r) => setTimeout(r, 300));
        }

        if (!unlimited && allRawByUrl.size >= maxResults) break;
      }

      // マージ済みの全結果に対して履歴重複・BL判定を行い、最終保存
      const merged = Array.from(allRawByUrl.values());
      const final = unlimited ? merged : merged.slice(0, maxResults);

      // 最終バッチとして履歴保存（isLast=trueで1回だけ）
      if (final.length > 0) {
        await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            searchQuery: query,
            dateRestrict,
            page: 1,
            deduplication,
            isLast: true,
            // 結果を直接渡すのではなくFunctionが履歴を参照して保存するため、
            // ダミーで1件だけ叩く（実際の保存はisLast=trueのリクエストで行う）
          }),
        });
      }

      // BL・重複をクライアント側で最終判定（表示用）
      // 履歴は最終保存後にFunctionが参照するため、ここではstatusを仮設定
      setResults(final);
      setStats({
        total: final.length,
        new: final.filter((r) => r.status === 'new').length,
        duplicate: final.filter((r) => r.status === 'duplicate').length,
        blacklisted: final.filter((r) => r.status === 'blacklisted').length,
      });
      setLastRun(new Date());
      setTab('results');
      setModalDone(true);

    } catch (e) {
      const msg = e instanceof Error ? e.message : 'エラーが発生しました';
      setModalError(msg);
      setError(msg);
    }
  }

  function handleAbort() { abortRef.current = true; }
  function handleModalClose() { setModalOpen(false); }

  // ---- ブラックリスト ----
  async function handleAddBl() {
    if (!blInput.trim()) return;
    await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: blInput.trim() }) });
    setBlInput('');
    fetchBlacklist();
  }

  async function handleRemoveBl(prefix: string) {
    await fetch(`${API}?action=blacklist&prefix=${encodeURIComponent(prefix)}`, { method: 'DELETE' });
    fetchBlacklist();
  }

  function exportBlCsv() {
    const csv = 'prefix\n' + blacklist.map((p) => `"${p}"`).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `blacklist_${Date.now()}.csv`;
    a.click();
  }

  function handleBlFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^"|"$/g, '').trim());
      const prefixes = lines.filter((l) => l && l !== 'prefix');
      if (prefixes.length === 0) return;
      await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes }) });
      fetchBlacklist();
      if (blFileRef.current) blFileRef.current.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  }

  // ---- 対象ドメイン ----
  async function handleAddDomain() {
    const d = normalizeDomain(domainInput);
    if (!d) return;
    await fetch(`${API}?action=domains`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: d }) });
    setDomainInput('');
    fetchDomains();
  }

  async function handleRemoveDomain(domain: string) {
    await fetch(`${API}?action=domains&domain=${encodeURIComponent(domain)}`, { method: 'DELETE' });
    fetchDomains();
  }

  function exportDomainCsv() {
    const csv = 'domain\n' + domains.map((d) => `"${d}"`).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `domains_${Date.now()}.csv`;
    a.click();
  }

  function handleDomainFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).map((l) => normalizeDomain(l.replace(/^"|"$/g, '')));
      const domainList = lines.filter((l) => l && l !== 'domain');
      if (domainList.length === 0) return;
      await fetch(`${API}?action=domains`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domains: domainList }) });
      fetchDomains();
      if (domainFileRef.current) domainFileRef.current.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  }

  // ---- 履歴 ----
  async function fetchHistory() {
    const res = await fetch(`${API}?action=history`);
    const data = await res.json();
    setHistory(data.history ?? []);
  }

  async function handleClearHistory() {
    if (!confirm('取得履歴を全件削除しますか？')) return;
    await fetch(`${API}?action=history`, { method: 'DELETE' });
    setHistory([]);
  }

  // ---- CSV ----
  function exportCsv() {
    const header = 'status,url,title,description,fetchedAt';
    const rows = results
      .filter((r) => r.status !== 'blacklisted')
      .map((r) => `"${r.status}","${r.url}","${r.title.replace(/"/g, '""')}","${r.description.replace(/"/g, '""')}","${r.fetchedAt}"`);
    const blob = new Blob(['\uFEFF' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `search_${query}_${Date.now()}.csv`;
    a.click();
  }

  function formatRelative(date: Date): string {
    const diff = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diff < 1) return 'たった今';
    if (diff < 60) return `${diff}分前`;
    return `${Math.floor(diff / 60)}時間前`;
  }

  const searchResults = results.filter((r) => r.status !== 'blacklisted');
  const blacklistedResults = results.filter((r) => r.status === 'blacklisted');
  const newResults = results.filter((r) => r.status === 'new');

  const TABS: { key: TabType; label: string; count?: number }[] = [
    { key: 'results', label: '検索結果', count: searchResults.length },
    { key: 'blacklisted', label: 'BL除外', count: blacklistedResults.length },
    { key: 'history', label: '履歴' },
  ];

  return (
    <div style={s.page}>
      <h1 style={s.h1}>検索結果スクレイパー</h1>

      {/* 検索フォーム */}
      <div style={s.card}>
        <p style={s.label}>検索キーワード</p>
        <div style={s.row}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="例: Next.js パフォーマンス" style={{ ...s.input, flex: 1 }} />
          <button onClick={handleSearch} disabled={modalOpen && !modalDone} style={s.btnPrimary}>検索実行</button>
        </div>
        <div style={s.grid3}>
          <div>
            <p style={s.label}>期間絞り込み</p>
            <select value={dateRestrict} onChange={(e) => setDateRestrict(e.target.value as DateRestrict)} style={s.input}>
              {DATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <p style={s.label}>最大取得件数</p>
            <select value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} style={s.input}>
              {COUNT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <p style={s.label}>重複除外</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36 }}>
              <input type="checkbox" id="dedup" checked={deduplication} onChange={(e) => setDeduplication(e.target.checked)} />
              <label htmlFor="dedup" style={{ fontSize: 13, cursor: 'pointer' }}>履歴との重複を除外</label>
            </div>
          </div>
        </div>
      </div>

      {/* 対象ドメイン */}
      <div style={{ ...s.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ ...s.label, marginBottom: 0, flex: 1 }}>対象ドメイン（未設定時はウェブ全体）</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={exportDomainCsv} style={s.btnSm} disabled={domains.length === 0}>CSVエクスポート</button>
            <button onClick={() => domainFileRef.current?.click()} style={s.btnSm}>CSVインポート</button>
            <input ref={domainFileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleDomainFileChange} />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 28 }}>
          {domains.length === 0 && <span style={{ fontSize: 12, color: '#999' }}>未設定（ウェブ全体を検索）</span>}
          {domains.map((d) => (
            <span key={d} style={s.tag}>
              {d}
              <button onClick={() => handleRemoveDomain(d)} style={s.tagDel}>×</button>
            </span>
          ))}
        </div>
        <div style={s.row}>
          <input value={domainInput} onChange={(e) => setDomainInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
            placeholder="example.com を追加（http://不要）" style={{ ...s.input, flex: 1 }} />
          <button onClick={handleAddDomain} style={s.btn}>追加</button>
        </div>
      </div>

      {/* ブラックリスト */}
      <div style={{ ...s.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ ...s.label, marginBottom: 0, flex: 1 }}>ブラックリスト（URLプレフィックス）</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={exportBlCsv} style={s.btnSm} disabled={blacklist.length === 0}>CSVエクスポート</button>
            <button onClick={() => blFileRef.current?.click()} style={s.btnSm}>CSVインポート</button>
            <input ref={blFileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleBlFileChange} />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 28 }}>
          {blacklist.length === 0 && <span style={{ fontSize: 12, color: '#999' }}>未設定</span>}
          {blacklist.map((prefix) => (
            <span key={prefix} style={s.tag}>
              {prefix}
              <button onClick={() => handleRemoveBl(prefix)} style={s.tagDel}>×</button>
            </span>
          ))}
        </div>
        <div style={s.row}>
          <input value={blInput} onChange={(e) => setBlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddBl()}
            placeholder="example.com を追加..." style={{ ...s.input, flex: 1 }} />
          <button onClick={handleAddBl} style={s.btn}>追加</button>
        </div>
      </div>

      {/* エラー */}
      {error && !modalOpen && <div style={s.errorBox}>{error}</div>}

      {/* ステータスバー */}
      {stats && (
        <div style={s.statusBar}>
          <Badge type="new">新規 {stats.new}件</Badge>
          <Badge type="duplicate">重複 {stats.duplicate}件</Badge>
          <Badge type="blacklisted">BL除外 {stats.blacklisted}件</Badge>
          <span style={{ marginLeft: 'auto', color: '#999', fontSize: 12 }}>
            合計 {stats.total}件{lastRun && ` · ${formatRelative(lastRun)}`}
          </span>
        </div>
      )}

      {/* タブ＆結果 */}
      {results.length > 0 && (
        <>
          <div style={s.tabBar}>
            {TABS.map((t) => (
              <button key={t.key}
                onClick={() => { setTab(t.key); if (t.key === 'history') fetchHistory(); }}
                style={{ ...s.tabBtn, borderBottom: tab === t.key ? '2px solid #000' : '2px solid transparent', fontWeight: tab === t.key ? 500 : 400 }}
              >
                {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              {tab === 'results' && (
                <>
                  <button onClick={exportCsv} style={s.btnSm}>CSVエクスポート</button>
                  <button onClick={() => navigator.clipboard.writeText(newResults.map((r) => `${r.url}\t${r.title}\t${r.description}`).join('\n'))} style={s.btnSm}>
                    新規のみコピー
                  </button>
                </>
              )}
              {tab === 'history' && (
                <button onClick={handleClearHistory} style={{ ...s.btnSm, color: '#c00' }}>履歴を全削除</button>
              )}
            </div>
          </div>

          <div style={{ ...s.card, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
            {tab === 'results' && (
              searchResults.length === 0 ? <p style={{ fontSize: 13, color: '#666' }}>結果なし</p>
                : searchResults.map((r) => (
                  <div key={r.url} style={{ ...s.resultRow, opacity: r.status === 'duplicate' ? 0.45 : 1 }}>
                    <div style={{ ...s.row, alignItems: 'center', marginBottom: 4 }}>
                      <span style={s.resultUrl}>{r.url}</span>
                      <Badge type={r.status}>{r.status === 'new' ? '新規' : '重複'}</Badge>
                    </div>
                    <div style={s.resultTitle}>
                      {r.status === 'new'
                        ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1558d6', textDecoration: 'none' }}>{r.title}</a>
                        : r.title}
                    </div>
                    <div style={s.resultDesc}>{r.description}</div>
                  </div>
                ))
            )}
            {tab === 'blacklisted' && (
              blacklistedResults.length === 0 ? <p style={{ fontSize: 13, color: '#666' }}>除外なし</p>
                : blacklistedResults.map((r) => (
                  <div key={r.url} style={{ ...s.resultRow, opacity: 0.5 }}>
                    <div style={{ ...s.row, alignItems: 'center', marginBottom: 4 }}>
                      <span style={s.resultUrl}>{r.url}</span>
                      <Badge type="blacklisted">BL除外</Badge>
                    </div>
                    <div style={s.resultTitle}>{r.title}</div>
                    <div style={s.resultDesc}>{r.description}</div>
                  </div>
                ))
            )}
            {tab === 'history' && (
              history.length === 0 ? <p style={{ fontSize: 13, color: '#666' }}>履歴なし</p>
                : history.map((h, i) => (
                  <div key={i} style={s.resultRow}>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>
                      {h.url} · {new Date(h.fetchedAt).toLocaleString('ja-JP')}
                    </div>
                    <div style={s.resultTitle}>
                      <a href={h.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1558d6', textDecoration: 'none' }}>{h.title}</a>
                    </div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>クエリ: {h.query}</div>
                  </div>
                ))
            )}
          </div>
        </>
      )}

      {/* 進捗モーダル */}
      {modalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modalBox}>
            <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>
              {modalDone ? '取得完了' : modalError ? 'エラーが発生しました' : '取得中...'}
            </p>
            {!modalError && (
              <>
                <p style={{ fontSize: 12, color: '#666', marginBottom: 10, textAlign: 'center', minHeight: 18 }}>
                  {modalStatus}
                </p>
                <div style={s.progressBar}>
                  <div style={{ ...s.progressFill, width: modalDone ? '100%' : '60%', background: modalDone ? '#1e7e34' : '#1558d6' }} />
                </div>
                <p style={{ fontSize: 13, color: '#555', marginTop: 10, textAlign: 'center' }}>
                  {modalDone ? `${modalTotal}件取得完了` : `${modalTotal}件取得済み`}
                </p>
              </>
            )}
            {modalError && <p style={{ fontSize: 13, color: '#c00', marginBottom: 12 }}>{modalError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
              {!modalDone && !modalError && (
                <button onClick={handleAbort} style={{ ...s.btn, color: '#c00', borderColor: '#fca5a5' }}>中断</button>
              )}
              {(modalDone || modalError) && (
                <button onClick={handleModalClose} style={s.btnPrimary}>閉じる</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ type, children }: { type: string; children: React.ReactNode }) {
  const colors: Record<string, { bg: string; color: string }> = {
    new:         { bg: '#e6f4ea', color: '#1e7e34' },
    duplicate:   { bg: '#f0f0f0', color: '#888' },
    blacklisted: { bg: '#fce8e8', color: '#c00' },
  };
  const c = colors[type] ?? colors.duplicate;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', background: c.bg, color: c.color }}>
      {children}
    </span>
  );
}

const s = {
  page:         { maxWidth: 800, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'system-ui, sans-serif' } as React.CSSProperties,
  h1:           { fontSize: 20, fontWeight: 600, marginBottom: '1.5rem' } as React.CSSProperties,
  card:         { background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, padding: '1rem 1.25rem' } as React.CSSProperties,
  label:        { fontSize: 12, color: '#666', marginBottom: 6 } as React.CSSProperties,
  row:          { display: 'flex', gap: 8 } as React.CSSProperties,
  grid3:        { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 } as React.CSSProperties,
  input:        { width: '100%', height: 36, padding: '0 10px', fontSize: 14, border: '0.5px solid #ccc', borderRadius: 8, boxSizing: 'border-box' } as React.CSSProperties,
  btn:          { height: 36, padding: '0 14px', fontSize: 13, border: '0.5px solid #ccc', borderRadius: 8, background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' } as React.CSSProperties,
  btnPrimary:   { height: 36, padding: '0 14px', fontSize: 13, border: 'none', borderRadius: 8, background: '#000', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' } as React.CSSProperties,
  btnSm:        { height: 28, padding: '0 10px', fontSize: 12, border: '0.5px solid #ccc', borderRadius: 8, background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' } as React.CSSProperties,
  tag:          { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f5f5f5', border: '0.5px solid #ddd', borderRadius: 20, padding: '3px 10px', fontSize: 12 } as React.CSSProperties,
  tagDel:       { background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: '#999', lineHeight: 1 } as React.CSSProperties,
  statusBar:    { marginTop: 12, background: '#f5f5f5', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } as React.CSSProperties,
  errorBox:     { marginTop: 12, padding: '0.75rem 1rem', background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#991b1b' } as React.CSSProperties,
  tabBar:       { display: 'flex', gap: 0, marginTop: 16, borderBottom: '0.5px solid #e0e0e0', alignItems: 'center' } as React.CSSProperties,
  tabBtn:       { background: 'none', border: 'none', padding: '0.5rem 1rem', fontSize: 13, cursor: 'pointer' } as React.CSSProperties,
  resultRow:    { padding: '0.75rem 0', borderBottom: '0.5px solid #e0e0e0' } as React.CSSProperties,
  resultUrl:    { flex: 1, fontSize: 11, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as React.CSSProperties,
  resultTitle:g  { fontSize: 14, fontWeight: 500, margin: '3px 0' } as React.CSSProperties,
  resultDesc:   { fontSize: 12, color: '#555', lineHeight: 1.5 } as React.CSSProperties,
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 } as React.CSSProperties,
  modalBox:     { background: '#fff', borderRadius: 12, padding: '2rem', width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' } as React.CSSProperties,
  progressBar:  { height: 6, background: '#e0e0e0', borderRadius: 3, overflow: 'hidden' } as React.CSSProperties,
  progressFill: { height: '100%', borderRadius: 3, transition: 'width 0.4s ease, background 0.4s ease' } as React.CSSProperties,
};