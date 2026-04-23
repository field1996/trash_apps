/* eslint-disable */
import React, { useState, useEffect, useCallback } from 'react';

type DateRestrict = 'w1' | 'm1' | 'y1';

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

const API = '/.netlify/functions/search';

const DATE_OPTIONS: { label: string; value: DateRestrict }[] = [
  { label: '直近1週間', value: 'w1' },
  { label: '直近1ヶ月', value: 'm1' },
  { label: '直近1年', value: 'y1' },
];

export default function SearchScraper() {
  const [query, setQuery] = useState('');
  const [dateRestrict, setDateRestrict] = useState<DateRestrict>('w1');
  const [maxResults, setMaxResults] = useState(10);
  const [deduplication, setDeduplication] = useState(true);

  const [results, setResults] = useState<AnnotatedResult[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [blInput, setBlInput] = useState('');

  const [tab, setTab] = useState<'results' | 'history'>('results');
  const [history, setHistory] = useState<{
    query: string; url: string; title: string; fetchedAt: string
  }[]>([]);

  const fetchBlacklist = useCallback(async () => {
    const res = await fetch(`${API}?action=blacklist`);
    const data = await res.json();
    setBlacklist(data.blacklist ?? []);
  }, []);

  useEffect(() => { fetchBlacklist(); }, [fetchBlacklist]);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, dateRestrict, maxResults, deduplication }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '検索に失敗しました');
      setResults(data.results);
      setStats(data.stats);
      setLastRun(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddBl() {
    if (!blInput.trim()) return;
    await fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: blInput }),
    });
    setBlInput('');
    fetchBlacklist();
  }

  async function handleRemoveBl(prefix: string) {
    await fetch(`${API}?action=blacklist&prefix=${encodeURIComponent(prefix)}`, { method: 'DELETE' });
    fetchBlacklist();
  }

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

  function exportCsv() {
    const header = 'status,url,title,description,fetchedAt';
    const rows = results.map(
      (r) => `"${r.status}","${r.url}","${r.title.replace(/"/g, '""')}","${r.description.replace(/"/g, '""')}","${r.fetchedAt}"`
    );
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

  const newResults = results.filter((r) => r.status === 'new');

  return (
    <div style={s.page}>
      <h1 style={s.h1}>検索結果スクレイパー</h1>

      {/* 検索フォーム */}
      <div style={s.card}>
        <p style={s.label}>検索キーワード</p>
        <div style={s.row}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="例: Next.js パフォーマンス 最適化"
            style={{ ...s.input, flex: 1 }}
          />
          <button onClick={handleSearch} disabled={loading} style={s.btnPrimary}>
            {loading ? '取得中...' : '検索実行'}
          </button>
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
              {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}件</option>)}
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

      {/* ブラックリスト */}
      <div style={{ ...s.card, marginTop: 12 }}>
        <p style={s.label}>ブラックリスト（URLプレフィックス）</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {blacklist.length === 0 && <span style={{ fontSize: 12, color: '#999' }}>未設定</span>}
          {blacklist.map((prefix) => (
            <span key={prefix} style={s.tag}>
              {prefix}
              <button onClick={() => handleRemoveBl(prefix)} style={s.tagDel}>×</button>
            </span>
          ))}
        </div>
        <div style={s.row}>
          <input
            value={blInput}
            onChange={(e) => setBlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddBl()}
            placeholder="example.com を追加..."
            style={{ ...s.input, flex: 1 }}
          />
          <button onClick={handleAddBl} style={s.btn}>追加</button>
        </div>
      </div>

      {/* エラー */}
      {error && <div style={s.errorBox}>{error}</div>}

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
            {(['results', 'history'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); if (t === 'history') fetchHistory(); }}
                style={{
                  ...s.tabBtn,
                  borderBottom: tab === t ? '2px solid #000' : '2px solid transparent',
                  fontWeight: tab === t ? 500 : 400,
                }}
              >
                {t === 'results' ? '検索結果' : '取得履歴'}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              {tab === 'results' && (
                <>
                  <button onClick={exportCsv} style={s.btnSm}>CSVエクスポート</button>
                  <button
                    onClick={() => navigator.clipboard.writeText(
                      newResults.map((r) => `${r.url}\t${r.title}\t${r.description}`).join('\n')
                    )}
                    style={s.btnSm}
                  >
                    新規のみコピー
                  </button>
                </>
              )}
              {tab === 'history' && (
                <button onClick={handleClearHistory} style={{ ...s.btnSm, color: '#c00' }}>
                  履歴を全削除
                </button>
              )}
            </div>
          </div>

          <div style={{ ...s.card, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
            {tab === 'results' && results.map((r) => (
              <div key={r.url} style={{ ...s.resultRow, opacity: r.status !== 'new' ? 0.45 : 1 }}>
                <div style={{ ...s.row, alignItems: 'center', marginBottom: 4 }}>
                  <span style={s.resultUrl}>{r.url}</span>
                  <Badge type={r.status}>
                    {r.status === 'new' ? '新規' : r.status === 'duplicate' ? '重複' : 'BL除外'}
                  </Badge>
                </div>
                <div style={s.resultTitle}>
                  {r.status === 'new'
                    ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1558d6', textDecoration: 'none' }}>{r.title}</a>
                    : r.title}
                </div>
                <div style={s.resultDesc}>{r.description}</div>
              </div>
            ))}

            {tab === 'history' && (
              history.length === 0
                ? <p style={{ fontSize: 13, color: '#666' }}>履歴なし</p>
                : history.map((h, i) => (
                  <div key={i} style={s.resultRow}>
                    <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>
                      {h.url} · {new Date(h.fetchedAt).toLocaleString('ja-JP')}
                    </div>
                    <div style={s.resultTitle}>
                      <a href={h.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1558d6', textDecoration: 'none' }}>
                        {h.title}
                      </a>
                    </div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>クエリ: {h.query}</div>
                  </div>
                ))
            )}
          </div>
        </>
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
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
      background: c.bg, color: c.color,
    }}>
      {children}
    </span>
  );
}

const s = {
  page:       { maxWidth: 800, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'system-ui, sans-serif' } as React.CSSProperties,
  h1:         { fontSize: 20, fontWeight: 600, marginBottom: '1.5rem' } as React.CSSProperties,
  card:       { background: '#fff', border: '0.5px solid #e0e0e0', borderRadius: 12, padding: '1rem 1.25rem' } as React.CSSProperties,
  label:      { fontSize: 12, color: '#666', marginBottom: 6 } as React.CSSProperties,
  row:        { display: 'flex', gap: 8 } as React.CSSProperties,
  grid3:      { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 } as React.CSSProperties,
  input:      { width: '100%', height: 36, padding: '0 10px', fontSize: 14, border: '0.5px solid #ccc', borderRadius: 8, boxSizing: 'border-box' } as React.CSSProperties,
  btn:        { height: 36, padding: '0 14px', fontSize: 13, border: '0.5px solid #ccc', borderRadius: 8, background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' } as React.CSSProperties,
  btnPrimary: { height: 36, padding: '0 14px', fontSize: 13, border: 'none', borderRadius: 8, background: '#000', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' } as React.CSSProperties,
  btnSm:      { height: 28, padding: '0 10px', fontSize: 12, border: '0.5px solid #ccc', borderRadius: 8, background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' } as React.CSSProperties,
  tag:        { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f5f5f5', border: '0.5px solid #ddd', borderRadius: 20, padding: '3px 10px', fontSize: 12 } as React.CSSProperties,
  tagDel:     { background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: '#999', lineHeight: 1 } as React.CSSProperties,
  statusBar:  { marginTop: 12, background: '#f5f5f5', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } as React.CSSProperties,
  errorBox:   { marginTop: 12, padding: '0.75rem 1rem', background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#991b1b' } as React.CSSProperties,
  tabBar:     { display: 'flex', gap: 0, marginTop: 16, borderBottom: '0.5px solid #e0e0e0', alignItems: 'center' } as React.CSSProperties,
  tabBtn:     { background: 'none', border: 'none', padding: '0.5rem 1rem', fontSize: 13, cursor: 'pointer' } as React.CSSProperties,
  resultRow:  { padding: '0.75rem 0', borderBottom: '0.5px solid #e0e0e0' } as React.CSSProperties,
  resultUrl:  { flex: 1, fontSize: 11, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as React.CSSProperties,
  resultTitle:{ fontSize: 14, fontWeight: 500, margin: '3px 0' } as React.CSSProperties,
  resultDesc: { fontSize: 12, color: '#555', lineHeight: 1.5 } as React.CSSProperties,
};