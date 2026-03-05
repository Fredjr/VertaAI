'use client';

import { useState } from 'react';

type Section = 'platform' | 'howitworks' | 'integrations' | 'security' | 'solutions';

export default function MarketingPage() {
  const [section, setSection] = useState<Section>('platform');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #020617; --surface: #0f172a; --surface2: #1e293b;
          --border: #1e293b; --border2: #334155;
          --text: #e2e8f0; --muted: #64748b;
          --accent: #6366f1; --accent2: #818cf8;
          --amber: #f59e0b; --green: #10b981; --red: #ef4444;
          --blue: #3b82f6; --purple: #a855f7; --orange: #f97316;
        }
        body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
        .mkt { min-height: 100vh; }

        /* ── NAV ── */
        .mkt-nav { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; justify-content: space-between; padding: 0 2rem; height: 64px; background: rgba(2,6,23,0.85); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,0.06); }
        .mkt-logo { font-size: 1.3rem; font-weight: 900; letter-spacing: -0.02em; color: var(--text); cursor: pointer; }
        .mkt-logo span { color: var(--accent2); }
        .mkt-nav-links { display: flex; gap: 0.25rem; list-style: none; }
        .mkt-nav-links button { display: block; padding: 0.4rem 0.75rem; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); background: none; border: none; border-radius: 6px; cursor: pointer; transition: color 0.15s; }
        .mkt-nav-links button:hover, .mkt-nav-links button.active { color: var(--text); }

        /* ── MOBILE NAV ── */
        .mkt-hamburger { display: none; align-items: center; justify-content: center; width: 36px; height: 36px; background: var(--surface); border: 1px solid rgba(255,255,255,0.08); border-radius: 7px; color: var(--text); font-size: 1.1rem; cursor: pointer; flex-shrink: 0; }
        .mkt-mobile-menu { position: fixed; top: 64px; left: 0; right: 0; background: rgba(2,6,23,0.97); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,0.06); z-index: 99; padding: 0.5rem; display: flex; flex-direction: column; }
        .mkt-mobile-menu button { text-align: left; padding: 0.85rem 1rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; color: var(--muted); background: none; border: none; cursor: pointer; transition: color 0.15s, background 0.15s; }
        .mkt-mobile-menu button.active, .mkt-mobile-menu button:hover { color: var(--text); background: var(--surface); }

        /* ── LAYOUT ── */
        .mkt-section { padding: 5rem 1.5rem; max-width: 1100px; margin: 0 auto; }

        /* ── TYPOGRAPHY ── */
        h1 { font-size: clamp(3rem, 7vw, 5.5rem); font-weight: 900; letter-spacing: -0.04em; line-height: 1.0; }
        h2 { font-size: clamp(2rem, 4vw, 3.5rem); font-weight: 900; letter-spacing: -0.04em; line-height: 1.0; }
        h3 { font-size: 1.1rem; font-weight: 700; }
        .label { display: inline-block; font-size: 0.65rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent2); background: rgba(99,102,241,0.12); padding: 0.2rem 0.6rem; border-radius: 4px; margin-bottom: 1rem; }
        .label-orange { color: #fdba74; background: rgba(251,146,60,0.12); }
        .gradient-text { background: linear-gradient(135deg,#818cf8 0%,#a78bfa 50%,#6ee7b7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .muted { color: var(--muted); }
        .lead { font-size: 1.1rem; color: var(--muted); max-width: 600px; line-height: 1.7; }

        /* ── GRIDS ── */
        .grid-2 { display: grid; grid-template-columns: repeat(auto-fit,minmax(280px,1fr)); gap: 1.25rem; }
        .grid-3 { display: grid; grid-template-columns: repeat(auto-fit,minmax(230px,1fr)); gap: 1.25rem; }
        .grid-4 { display: grid; grid-template-columns: repeat(auto-fit,minmax(210px,1fr)); gap: 1.25rem; }

        /* ── GLASS ── */
        .glass { background: rgba(15,23,42,0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 1.5rem; transition: border-color 0.15s; }
        .glass:hover { border-color: rgba(255,255,255,0.13); }
        .glass-lg { background: rgba(15,23,42,0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.07); border-radius: 32px; padding: 2.5rem; transition: border-color 0.15s; }
        .glass-lg:hover { border-color: rgba(255,255,255,0.13); }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
        .card-icon { width: 40px; height: 40px; background: var(--surface2); border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; margin-bottom: 1rem; }

        /* ── BADGES ── */
        .badge { display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.55rem; border-radius: 20px; }
        .badge-green  { background: rgba(16,185,129,0.12); color: var(--green); }
        .badge-amber  { background: rgba(245,158,11,0.12);  color: var(--amber); }
        .badge-red    { background: rgba(239,68,68,0.12);   color: var(--red); }
        .badge-blue   { background: rgba(59,130,246,0.12);  color: var(--blue); }
        .badge-purple { background: rgba(168,85,247,0.12);  color: var(--purple); }
        .badge-orange { background: rgba(251,146,60,0.12);  color: #fdba74; }

        /* ── TRACK PILLS ── */
        .track-pill { display: inline-block; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.06em; padding: 0.2rem 0.7rem; border-radius: 20px; }
        .track-0 { background: rgba(168,85,247,0.15); color: #c4b5fd; border: 1px solid rgba(168,85,247,0.3); }
        .track-a { background: rgba(99,102,241,0.15);  color: #a5b4fc; border: 1px solid rgba(99,102,241,0.3); }
        .track-b { background: rgba(16,185,129,0.15);  color: #6ee7b7; border: 1px solid rgba(16,185,129,0.3); }
        .track-1 { background: rgba(251,146,60,0.15);  color: #fdba74; border: 1px solid rgba(251,146,60,0.3); }

        /* ── HERO ── */
        .hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 7rem 1.5rem 5rem; max-width: 1100px; margin: 0 auto; position: relative; }
        .hero-glow { position: absolute; top: -20px; left: 50%; transform: translateX(-50%); width: 900px; height: 500px; background: radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 65%); pointer-events: none; z-index: 0; }
        .hero > * { position: relative; z-index: 1; }
        .hero-sub { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 2rem; flex-wrap: wrap; }
        .hero-desc { margin: 1.75rem auto 2.25rem; }
        .hero-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center; }
        .btn-primary { background: var(--accent); color: #fff; padding: 0.8rem 1.8rem; font-size: 0.9rem; font-weight: 700; border: none; border-radius: 10px; cursor: pointer; text-decoration: none; display: inline-block; transition: background 0.15s, transform 0.1s; }
        .btn-primary:hover { background: var(--accent2); transform: translateY(-1px); }
        .btn-secondary { background: rgba(255,255,255,0.04); color: var(--text); padding: 0.8rem 1.8rem; font-size: 0.9rem; font-weight: 700; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; cursor: pointer; text-decoration: none; display: inline-block; transition: border-color 0.15s, background 0.15s; }
        .btn-secondary:hover { border-color: var(--accent); background: rgba(99,102,241,0.08); }
        .editor-strip { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 2rem 0 0; justify-content: center; }
        .editor-chip { display: flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 0.35rem 0.75rem; border-radius: 20px; font-size: 0.8rem; color: var(--muted); }
        .stats-bar { display: grid; grid-template-columns: repeat(auto-fit,minmax(140px,1fr)); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-top: 4rem; width: 100%; }
        .stat { background: var(--surface); padding: 1.5rem; text-align: center; }
        .stat-num { font-size: 2rem; font-weight: 900; color: var(--accent2); letter-spacing: -0.04em; }
        .stat-label { font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem; }

        /* ── SCANNING PILL ── */
        @keyframes pulse-soft { 0%,100%{opacity:1} 50%{opacity:0.65} }
        .scanning { animation: pulse-soft 2.5s infinite; }

        /* ── TRACK CARDS ── */
        .track-card { background: rgba(15,23,42,0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 2rem; position: relative; overflow: hidden; transition: border-color 0.15s; }
        .track-card:hover { border-color: rgba(255,255,255,0.14); }
        .track-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
        .track-card.t0::before { background: linear-gradient(90deg,#a855f7,#7c3aed); }
        .track-card.ta::before { background: linear-gradient(90deg,#6366f1,#4f46e5); }
        .track-card.tb::before { background: linear-gradient(90deg,#10b981,#059669); }
        .track-card.t1::before { background: linear-gradient(90deg,#f97316,#ea580c); }
        .track-title { font-size: 1.05rem; font-weight: 800; margin: 0.75rem 0 0.5rem; }
        .track-desc  { font-size: 0.88rem; color: var(--muted); line-height: 1.65; }
        .track-bullets { list-style: none; margin-top: 1rem; }
        .track-bullets li { font-size: 0.83rem; color: var(--muted); padding: 0.2rem 0; display: flex; align-items: flex-start; gap: 0.5rem; }
        .track-bullets li::before { content: '→'; color: var(--accent2); flex-shrink: 0; }

        /* ── PIPELINE DIAGRAM ── */
        .pipeline-wrap { background: rgba(15,23,42,0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 1.5rem; margin: 2.5rem 0; }
        .pipeline-wrap h4 { font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; color: var(--muted); margin-bottom: 1.25rem; }
        .pipeline { display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem; }
        .pipeline-node { border: 1px solid var(--border); border-radius: 9px; padding: 0.75rem 0.9rem; text-align: center; min-width: 90px; flex: 1; }
        .pipeline-node.p-neutral { background: rgba(255,255,255,0.03); }
        .pipeline-node.p0 { border-color: rgba(168,85,247,0.5); background: rgba(168,85,247,0.08); }
        .pipeline-node.pa { border-color: rgba(99,102,241,0.5); background: rgba(99,102,241,0.08); }
        .pipeline-node.pb { border-color: rgba(16,185,129,0.5); background: rgba(16,185,129,0.08); }
        .pipeline-node.p1 { border-color: rgba(251,146,60,0.5); background: rgba(251,146,60,0.08); }
        .pipeline-node .pn-track { font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.2rem; }
        .p0 .pn-track { color: #c4b5fd; } .pa .pn-track { color: #a5b4fc; } .pb .pn-track { color: #6ee7b7; } .p1 .pn-track { color: #fdba74; }
        .pipeline-node .pn-title { font-size: 0.78rem; font-weight: 600; color: var(--text); line-height: 1.3; }
        .pipeline-arrow { color: var(--muted); font-size: 0.9rem; flex-shrink: 0; padding: 0 0.1rem; }

        /* ── TIMELINE ── */
        .timeline-item { display: grid; grid-template-columns: 48px 1fr; gap: 1.5rem; margin-bottom: 3rem; }
        .timeline-number { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; font-weight: 900; flex-shrink: 0; }
        .tn-0 { background: rgba(168,85,247,0.2); color: #c4b5fd; }
        .tn-a { background: rgba(99,102,241,0.2); color: #a5b4fc; }
        .tn-b { background: rgba(16,185,129,0.2); color: #6ee7b7; }
        .tn-1 { background: rgba(251,146,60,0.2); color: #fdba74; }
        .timeline-content { padding-top: 0.5rem; }
        .timeline-content h3 { font-size: 1.2rem; font-weight: 800; margin-bottom: 0.5rem; letter-spacing: -0.02em; }
        .timeline-content p  { color: var(--muted); font-size: 0.92rem; line-height: 1.7; }

        /* ── QUALITY SCORE ── */
        .quality-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(150px,1fr)); gap: 0.75rem; margin-top: 1.25rem; }
        .quality-card { background: var(--surface); border: 1px solid var(--border); border-radius: 9px; padding: 0.85rem; }
        .quality-label { font-size: 0.72rem; color: var(--muted); margin-bottom: 0.5rem; }
        .quality-score { font-size: 1.1rem; font-weight: 800; color: var(--accent2); }
        .quality-bar-track { background: var(--surface2); border-radius: 4px; height: 3px; margin-top: 0.4rem; }
        .quality-bar-fill { height: 3px; border-radius: 4px; }

        /* ── SPEC→BUILD→RUN ── */
        .sbr-wrap { display: grid; grid-template-columns: 1fr 32px 1fr 32px 1fr; gap: 0.5rem; align-items: center; margin: 2rem 0; }
        .sbr-node { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; text-align: center; }
        .sbr-node h4 { font-size: 0.85rem; font-weight: 700; margin-bottom: 0.35rem; }
        .sbr-node p { font-size: 0.78rem; color: var(--muted); line-height: 1.5; }
        .sbr-arrow { text-align: center; color: var(--muted); font-size: 1.2rem; }

        /* ── PERM GRID ── */
        .perm-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(190px,1fr)); gap: 0.75rem; margin-top: 1.5rem; }
        .perm-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 9px; padding: 0.9rem 1rem; }
        .perm-cap { font-family: 'SF Mono',monospace; font-size: 0.78rem; color: var(--text); margin-bottom: 0.35rem; }

        /* ── INT GRID ── */
        .int-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(180px,1fr)); gap: 1rem; margin-top: 2rem; }
        .int-card { background: rgba(15,23,42,0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; transition: border-color 0.15s; }
        .int-card:hover { border-color: rgba(255,255,255,0.14); }
        .int-icon { font-size: 1.8rem; } .int-name { font-weight: 700; font-size: 0.9rem; } .int-desc { font-size: 0.8rem; color: var(--muted); }

        /* ── SPAGHETTI COMPARISON ── */
        .comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-top: 1.5rem; }
        .comparison-bad  { background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.2); border-radius: 14px; padding: 1.25rem; }
        .comparison-good { background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.2); border-radius: 14px; padding: 1.25rem; }
        .comparison-header { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.75rem; }
        .comparison-bad  .comparison-header { color: var(--red); }
        .comparison-good .comparison-header { color: var(--green); }
        .comparison-item { font-size: 0.82rem; color: var(--muted); padding: 0.2rem 0; display: flex; gap: 0.5rem; }

        /* ── AUDIT TRAIL ── */
        .audit-row { display: flex; gap: 1rem; align-items: flex-start; padding: 0.9rem 0; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
        .audit-row:last-child { border-bottom: none; }
        .audit-time { color: var(--muted); font-family: monospace; white-space: nowrap; min-width: 130px; }

        /* ── TERMINAL ── */
        .terminal { background: #0a0f1e; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; font-family: 'SF Mono','Fira Code',monospace; font-size: 0.82rem; }
        .terminal-bar { display: flex; align-items: center; gap: 6px; padding: 0.6rem 1rem; background: var(--surface); border-bottom: 1px solid var(--border); }
        .terminal-dot { width: 11px; height: 11px; border-radius: 50%; }
        .terminal-body { padding: 1.25rem; line-height: 1.7; }
        .t-ok { color: var(--green); } .t-warn { color: var(--amber); } .t-block { color: var(--red); }
        .t-out { color: var(--muted); } .t-dim { color: #4a5568; } .t-orange { color: #fdba74; }

        /* ── PERSONA CARDS ── */
        .persona-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(290px,1fr)); gap: 1.5rem; margin-top: 3rem; }
        .persona-card { background: rgba(15,23,42,0.6); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.07); border-radius: 32px; padding: 2.5rem; display: flex; flex-direction: column; transition: border-color 0.15s; }
        .persona-card:hover { border-color: rgba(255,255,255,0.14); }
        .persona-tag { font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.16em; margin-bottom: 1.25rem; }
        .persona-card h3 { font-size: 1.75rem; font-weight: 900; letter-spacing: -0.03em; line-height: 1.1; color: var(--text); margin-bottom: 1rem; }
        .persona-card > p { font-size: 0.9rem; color: var(--muted); line-height: 1.7; margin-bottom: 1.5rem; }
        .persona-bullets { list-style: none; margin-bottom: 1.75rem; flex: 1; }
        .persona-bullets li { font-size: 0.85rem; color: var(--muted); padding: 0.4rem 0; display: flex; gap: 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .persona-bullets li:last-child { border-bottom: none; }
        .persona-bullets li::before { content: '→'; flex-shrink: 0; color: var(--accent2); }
        .outcome-chip { border-radius: 10px; padding: 0.75rem 1rem; text-align: center; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; margin-top: auto; }
        .outcome-indigo { background: rgba(99,102,241,0.12); color: #a5b4fc; }
        .outcome-green  { background: rgba(16,185,129,0.12); color: #6ee7b7; }
        .outcome-orange { background: rgba(251,146,60,0.12); color: #fdba74; }

        /* ── FOOTER ── */
        .mkt-footer { border-top: 1px solid rgba(255,255,255,0.06); padding: 2.5rem 1.5rem; text-align: center; color: var(--muted); font-size: 0.85rem; }
        .mkt-footer a { color: var(--muted); text-decoration: none; }
        .mkt-footer a:hover { color: var(--text); }
        code { font-family: 'SF Mono','Fira Code',monospace; font-size: 0.75rem; color: var(--accent2); }

        /* ── RESPONSIVE ── */
        @media (max-width: 768px) {
          .pipeline { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 0.75rem; -webkit-overflow-scrolling: touch; gap: 0.15rem; }
          .pipeline-wrap { padding: 1rem; }
          .pipeline-node { min-width: 72px; max-width: 92px; flex: 0 0 80px; padding: 0.55rem 0.4rem; }
          .pipeline-node .pn-title { font-size: 0.68rem; }
          .pipeline-node .pn-track { font-size: 0.52rem; }
          .pipeline-arrow { font-size: 0.7rem; padding: 0; }
          .sbr-wrap { grid-template-columns: 1fr; gap: 0.5rem; }
          .sbr-arrow { display: none; }
          .comparison-grid { grid-template-columns: 1fr; }
          .timeline-item { grid-template-columns: 40px 1fr; gap: 1rem; }
          .timeline-number { width: 40px; height: 40px; font-size: 0.95rem; }
          .stats-bar { grid-template-columns: repeat(2,1fr); }
          .quality-grid { grid-template-columns: repeat(2,1fr); }
          .mkt-section { padding: 2.5rem 1rem; }
          h2 { font-size: 2rem; }
          .persona-card { border-radius: 20px; padding: 1.75rem; }
          .persona-card h3 { font-size: 1.35rem; }
        }
        @media (max-width: 640px) {
          .mkt-nav { padding: 0 1rem; }
          .mkt-nav-links { display: none; }
          .mkt-hamburger { display: flex; }
          .stats-bar { display: none; }
          .hero { padding: 3rem 1rem 3rem; }
          .hero-glow { width: 400px; height: 300px; }
          .hero-sub { gap: 0.35rem; }
          .track-pill { font-size: 0.6rem; padding: 0.15rem 0.5rem; }
          .editor-strip { gap: 0.35rem; }
          .editor-chip { font-size: 0.72rem; padding: 0.25rem 0.6rem; }
          .grid-3, .grid-4, .grid-2 { grid-template-columns: 1fr; }
          .int-grid { grid-template-columns: 1fr 1fr; }
          .perm-grid { grid-template-columns: 1fr 1fr; }
          h1 { font-size: 2.2rem; }
          h2 { font-size: 1.6rem; }
          .lead { font-size: 1rem; }
          .quality-grid { grid-template-columns: 1fr 1fr; }
          .btn-primary, .btn-secondary { width: 100%; text-align: center; }
          .hero-actions { flex-direction: column; }
          .persona-grid { grid-template-columns: 1fr; }
          .persona-card { border-radius: 16px; }
        }
      `}</style>

      <div className="mkt">
        {/* ── NAV ── */}
        <nav className="mkt-nav">
          <span className="mkt-logo" onClick={() => setSection('platform')}>Verta<span>AI</span></span>
          <ul className="mkt-nav-links">
            {(['platform','howitworks','integrations','security','solutions'] as Section[]).map(s => (
              <li key={s}>
                <button className={section === s ? 'active' : ''} onClick={() => setSection(s)}>
                  {{ platform:'Platform', howitworks:'How It Works', integrations:'Integrations', security:'Security', solutions:'Solutions' }[s]}
                </button>
              </li>
            ))}
          </ul>
          <button className="mkt-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
            {menuOpen ? '✕' : '☰'}
          </button>
        </nav>
        {menuOpen && (
          <div className="mkt-mobile-menu">
            {(['platform','howitworks','integrations','security','solutions'] as Section[]).map(s => (
              <button key={s} className={section === s ? 'active' : ''} onClick={() => { setSection(s); setMenuOpen(false); }}>
                {{ platform:'Platform', howitworks:'How It Works', integrations:'Integrations', security:'Security', solutions:'Solutions' }[s]}
              </button>
            ))}
          </div>
        )}

        {/* ══════════════ PLATFORM ══════════════ */}
        {section === 'platform' && (
          <>
            {/* HERO */}
            <div className="hero">
              <div className="hero-glow" />
              <div className="hero-sub scanning">
                <span style={{width:8,height:8,borderRadius:'50%',background:'var(--accent)',display:'inline-block'}}></span>
                <span className="label" style={{marginBottom:0}}>AI Agent Governance</span>
                <span className="track-pill track-0">Track 0 · Pre-flight</span>
                <span className="track-pill track-1">Track 1 · In-Editor</span>
                <span className="track-pill track-a">Track A · PR Gate</span>
                <span className="track-pill track-b">Track B · Runtime</span>
              </div>
              <h1>Stop runaway AI agents.<br /><span className="gradient-text">Before they cost you.</span></h1>
              <p className="lead hero-desc">The Spec→Build→Run governance platform for AI coding agents. Four tracks. Five editors. Zero ungoverned code.</p>
              <div className="hero-actions">
                <a href="mailto:hello@vertaai.io" className="btn-primary">Request Early Access</a>
                <button className="btn-secondary" onClick={() => setSection('howitworks')}>See How It Works →</button>
              </div>
              <div className="editor-strip">
                <span className="muted" style={{fontSize:'0.8rem',alignSelf:'center'}}>Works with:</span>
                {[['🤖','Claude Code'],['🐙','GitHub Copilot'],['⚡','Cursor'],['🌊','Windsurf'],['🔮','Augment']].map(([e,n]) => (
                  <div key={n as string} className="editor-chip"><span>{e}</span> {n}</div>
                ))}
              </div>
              <div className="stats-bar">
                {[['12','Capability types'],['5','AI editors'],['4','Enforcement layers'],['100','Quality score max'],['60s','Permission TTL']].map(([n,l]) => (
                  <div key={l as string} className="stat"><div className="stat-num">{n}</div><div className="stat-label">{l}</div></div>
                ))}
              </div>
            </div>

            {/* PROBLEM */}
            <div className="mkt-section">
              <div className="label">The Problem</div>
              <h2>AI agents are shipping code<br/>nobody is watching.</h2>
              <p className="lead" style={{marginTop:'1.25rem',marginBottom:'3rem'}}>Copilot, Cursor, Claude Code, Windsurf — each operates in isolation. No awareness of your IAM policy, your off-limits services, or your runbook.</p>
              <div className="grid-3">
                {[
                  ['🔑','Capability Sprawl','Agents request IAM roles, write secrets, and modify infrastructure with no pre-flight check against your policy.'],
                  ['🕵️','Zero Provenance','When an incident hits, you can\'t trace which agent wrote the code, under what context, or with what declared intent.'],
                  ['🍝','Spaghetti Code','Unconstrained agents create the 7th version of the same utility function, touch 80 files for a 5-file ticket, and generate N+1 abstractions.'],
                ].map(([icon,title,desc]) => (
                  <div key={title as string} className="glass">
                    <div className="card-icon">{icon}</div>
                    <h3>{title}</h3>
                    <p style={{fontSize:'0.875rem',color:'var(--muted)',marginTop:'0.5rem'}}>{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* PIPELINE DIAGRAM */}
            <div className="mkt-section" style={{paddingTop:'0'}}>
              <div className="label">The Governance Pipeline</div>
              <h2>Four tracks.<br/>One source of truth.</h2>
              <p className="lead" style={{marginTop:'1.25rem',marginBottom:'1.5rem'}}>Tracks 0 and 1 live inside the editor. Tracks A and B enforce at PR time and runtime.</p>
              <div className="pipeline-wrap">
                <h4>Governance pipeline — left to right</h4>
                <div className="pipeline">
                  <div className="pipeline-node p-neutral"><div className="pn-track" style={{color:'var(--muted)'}}>Start</div><div className="pn-title">Open Editor</div></div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-node p0"><div className="pn-track">Track 0</div><div className="pn-title">Permission Envelope</div></div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-node p-neutral"><div className="pn-track" style={{color:'var(--muted)'}}>Code</div><div className="pn-title">Agent Writes Code</div></div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-node p1"><div className="pn-track">Track 1</div><div className="pn-title">In-Editor · Live</div></div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-node pa"><div className="pn-track">Track A</div><div className="pn-title">PR Gate · 5 Checks</div></div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-node p-neutral"><div className="pn-track" style={{color:'var(--muted)'}}>Ship</div><div className="pn-title">Merge + Deploy</div></div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-node pb"><div className="pn-track">Track B</div><div className="pn-title">Runtime Audit</div></div>
                </div>
              </div>
            </div>

            {/* 4 TRACK CARDS */}
            <div className="mkt-section" style={{paddingTop:'0'}}>
              <div className="grid-4">
                <div className="track-card t0">
                  <span className="track-pill track-0">Track 0</span>
                  <div className="track-title">Pre-flight Permission Envelope</div>
                  <div className="track-desc">Before any code is written, the agent receives a permission envelope compiled from active Policy Packs. Blocked capabilities are off the table from keystroke one.</div>
                  <ul className="track-bullets">
                    <li>Compiled from workspace Policy Packs</li>
                    <li>Injected into 5 editor config files</li>
                    <li>5 blocked + 7 declaration-required caps</li>
                    <li>Session budgets: max files + abstractions</li>
                  </ul>
                </div>
                <div className="track-card t1">
                  <span className="track-pill track-1">Track 1</span>
                  <div className="track-title">In-Editor Governance Feedback</div>
                  <div className="track-desc">Real-time governance alerts pushed directly into the developer's editor via SSE while they code — no context switch, no Slack tab hunting.</div>
                  <ul className="track-bullets">
                    <li>Real-time SSE push to open editors</li>
                    <li>CodeLens: agent · PR · quality score</li>
                    <li>Closes the governance loop</li>
                    <li>Alert surfaced where code lives</li>
                  </ul>
                </div>
                <div className="track-card ta">
                  <span className="track-pill track-a">Track A</span>
                  <div className="track-title">YAML Policy Gate at PR Review</div>
                  <div className="track-desc">5 automated comparators check intent parity, abstraction risk, churn, imports, and infra ownership. Posts as a blocking GitHub Check.</div>
                  <ul className="track-bullets">
                    <li>Intent ↔ capability parity</li>
                    <li>Spaghetti prevention (abstraction risk)</li>
                    <li>Churn + complexity thresholds</li>
                    <li>Over-permissioned import detection</li>
                  </ul>
                </div>
                <div className="track-card tb">
                  <span className="track-pill track-b">Track B</span>
                  <div className="track-title">Runtime Drift Detection</div>
                  <div className="track-desc">In production, VertaAI monitors CloudTrail, GCP Audit Logs, and DB query logs for undeclared capability usage. PagerDuty + Slack on CRITICAL drift.</div>
                  <ul className="track-bullets">
                    <li>AWS CloudTrail + GCP Audit ingestion</li>
                    <li>Decay-weighted severity scoring</li>
                    <li>Cross-service correlation signals</li>
                    <li>Auto-close when drift resolves</li>
                  </ul>
                </div>
              </div>
            </div>

            <footer className="mkt-footer"><p>© 2026 VertaAI &nbsp;·&nbsp; <a href="mailto:hello@vertaai.io">hello@vertaai.io</a></p></footer>
          </>
        )}

        {/* ══════════════ HOW IT WORKS ══════════════ */}
        {section === 'howitworks' && (
          <>
            <div className="mkt-section">
              <div className="label">How It Works</div>
              <h2>Four enforced stages.<br/>One pipeline.</h2>
              <p className="lead" style={{marginTop:'1.25rem',marginBottom:'2rem'}}>Tracks 0 and 1 govern the editor experience. Track A gates the PR. Track B audits production.</p>

              {/* Pipeline diagram */}
              <div className="pipeline-wrap">
                <h4>End-to-end governance pipeline</h4>
                <div className="pipeline">
                  {[
                    {cls:'p-neutral',track:'',title:'Open Editor'},null,
                    {cls:'p0',track:'Track 0',title:'Permission Envelope'},null,
                    {cls:'p-neutral',track:'',title:'Write Code'},null,
                    {cls:'p1',track:'Track 1',title:'In-Editor · Live'},null,
                    {cls:'pa',track:'Track A',title:'PR Gate'},null,
                    {cls:'p-neutral',track:'',title:'Merge + Deploy'},null,
                    {cls:'pb',track:'Track B',title:'Runtime Audit'},
                  ].map((node,i) => node === null
                    ? <div key={i} className="pipeline-arrow">→</div>
                    : <div key={i} className={`pipeline-node ${node.cls}`}>
                        {node.track && <div className="pn-track">{node.track}</div>}
                        <div className="pn-title">{node.title}</div>
                      </div>
                  )}
                </div>
              </div>

              {/* Track 0 */}
              <div className="timeline-item" style={{marginTop:'3.5rem'}}>
                <div className="timeline-number tn-0">0</div>
                <div className="timeline-content">
                  <span className="track-pill track-0" style={{marginBottom:'0.6rem',display:'inline-block'}}>Track 0 · Pre-flight</span>
                  <h3>Permission envelope compiled and injected into every editor</h3>
                  <p>Before any code is written, VertaAI compiles a permission envelope from active Policy Packs and pushes it to all 5 editors automatically — on setup and on every policy change. Five blocked capabilities. Seven requiring declaration. Session budgets enforced from keystroke one.</p>
                </div>
              </div>

              {/* Track 1 */}
              <div className="timeline-item">
                <div className="timeline-number tn-1">1</div>
                <div className="timeline-content">
                  <span className="track-pill track-1" style={{marginBottom:'0.6rem',display:'inline-block'}}>Track 1 · In-Editor</span>
                  <h3>Governance alerts surface in the editor — not just Slack</h3>
                  <p>While the developer is coding, VertaAI pushes real-time governance events via SSE directly into the open editor. Permission violations, quality score updates, and production drift alerts all appear inline — right where the code lives, without a context switch.</p>
                </div>
              </div>

              {/* Track A */}
              <div className="timeline-item">
                <div className="timeline-number tn-a">A</div>
                <div className="timeline-content">
                  <span className="track-pill track-a" style={{marginBottom:'0.6rem',display:'inline-block'}}>Track A · PR Gate</span>
                  <h3>5 automated comparators run on every AI-authored PR</h3>
                  <p>When a PR opens, VertaAI evaluates five governance checks against the code, the declared intent artifact, and active Policy Packs — intent parity, abstraction risk, churn, import hygiene, and infra ownership. A blocking GitHub Check posts the result with a quality score (0–100).</p>
                </div>
              </div>

              {/* Track B */}
              <div className="timeline-item">
                <div className="timeline-number tn-b">B</div>
                <div className="timeline-content">
                  <span className="track-pill track-b" style={{marginBottom:'0.6rem',display:'inline-block'}}>Track B · Runtime</span>
                  <h3>Continuous drift detection across CloudTrail, GCP, and DB logs</h3>
                  <p>Post-deploy, VertaAI ingests AWS CloudTrail, GCP Audit Logs, and DB query logs. Undeclared capability usage surfaces as a DriftCluster with decay-weighted severity, cross-service correlation, and A/B/C remediation options. PagerDuty + Slack on CRITICAL alerts.</p>
                </div>
              </div>

              {/* SPAGHETTI PREVENTION */}
              <div style={{marginTop:'4rem',paddingTop:'3rem',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                <div className="label label-orange">Spaghetti Prevention</div>
                <h2>Unconstrained agents sprawl.<br/>VertaAI sets the guardrails.</h2>
                <p className="lead" style={{marginTop:'1.25rem',marginBottom:'1.5rem'}}>AI agents left without limits create the 7th version of the same utility function, touch 80 files for a 5-file ticket, and generate N+1 abstractions daily.</p>
                <div className="comparison-grid">
                  <div className="comparison-bad">
                    <div className="comparison-header">❌ Without VertaAI</div>
                    {[
                      'Agent creates UserAuthHelper, AuthUtil, AuthHelper… (7th time)',
                      'PR touches 94 files for a single endpoint change',
                      'No churn limit: +3,200 lines in one session',
                      'Duplicate abstraction caught only in review — days later',
                      'No visibility into why the agent chose this approach',
                    ].map(t => <div key={t} className="comparison-item"><span style={{color:'var(--red)'}}>✗</span><span>{t}</span></div>)}
                  </div>
                  <div className="comparison-good">
                    <div className="comparison-header">✓ With VertaAI</div>
                    {[
                      'DUPLICATE_ABSTRACTION_RISK flags 0.78 similarity at PR time — before merge',
                      'Session budget: max 20 files — agent stops and declares intent',
                      'Churn threshold: 1,200 lines max — complex PRs require justification',
                      'Max 3 new abstractions per session — enforced by permission envelope',
                      'Intent artifact links every PR to declared purpose and quality score',
                    ].map(t => <div key={t} className="comparison-item"><span style={{color:'var(--green)'}}>✓</span><span>{t}</span></div>)}
                  </div>
                </div>
              </div>

              {/* PROVENANCE */}
              <div style={{marginTop:'4rem',paddingTop:'3rem',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                <div className="label">Provenance &amp; Black Box Debugging</div>
                <h2>When an incident hits —<br/>you need to know who wrote it.</h2>
                <p className="lead" style={{marginTop:'1.25rem',marginBottom:'1.5rem'}}>VertaAI links every AI-generated function to the agent that wrote it, the PR it came from, and a governance quality score across 5 dimensions.</p>

                <div className="glass" style={{marginBottom:'1.5rem'}}>
                  <div style={{fontSize:'0.78rem',color:'var(--muted)',marginBottom:'1rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em'}}>Agent code quality score — 5 dimensions · 0–100 composite</div>
                  <div className="quality-grid">
                    {[
                      {label:'Abstraction Safety',score:'92',pct:92,color:'#818cf8'},
                      {label:'Test Coverage Intent',score:'78',pct:78,color:'#818cf8'},
                      {label:'Churn Risk',score:'85',pct:85,color:'#10b981'},
                      {label:'Import Hygiene',score:'91',pct:91,color:'#818cf8'},
                      {label:'Capability Accuracy',score:'74',pct:74,color:'#f59e0b'},
                    ].map(({label,score,pct,color}) => (
                      <div key={label} className="quality-card">
                        <div className="quality-label">{label}</div>
                        <div className="quality-score" style={{color}}>{score}</div>
                        <div className="quality-bar-track">
                          <div className="quality-bar-fill" style={{width:`${pct}%`,background:color}}></div>
                        </div>
                      </div>
                    ))}
                    <div className="quality-card" style={{background:'rgba(99,102,241,0.08)',borderColor:'rgba(99,102,241,0.3)'}}>
                      <div className="quality-label">Overall Score</div>
                      <div className="quality-score" style={{fontSize:'1.6rem'}}>84</div>
                      <div style={{fontSize:'0.72rem',color:'var(--muted)',marginTop:'0.2rem'}}>Composite / 100</div>
                    </div>
                  </div>
                </div>

                <div style={{marginTop:'2rem'}}>
                  <div style={{fontSize:'0.72rem',color:'var(--muted)',marginBottom:'1rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em'}}>Chain of Custody — Spec → Build → Run</div>
                  <div className="sbr-wrap">
                    <div className="sbr-node" style={{borderColor:'rgba(168,85,247,0.3)',background:'rgba(168,85,247,0.06)'}}>
                      <span className="track-pill track-0" style={{marginBottom:'0.5rem',display:'inline-block'}}>Spec</span>
                      <h4>IntentArtifact</h4>
                      <p>Agent declares capabilities, scope, and purpose before writing code. Linked to PR.</p>
                    </div>
                    <div className="sbr-arrow">→</div>
                    <div className="sbr-node" style={{borderColor:'rgba(99,102,241,0.3)',background:'rgba(99,102,241,0.06)'}}>
                      <span className="track-pill track-a" style={{marginBottom:'0.5rem',display:'inline-block'}}>Build</span>
                      <h4>PR Gate Findings</h4>
                      <p>5 comparators validate declared intent vs. actual code. Findings stored at merge.</p>
                    </div>
                    <div className="sbr-arrow">→</div>
                    <div className="sbr-node" style={{borderColor:'rgba(16,185,129,0.3)',background:'rgba(16,185,129,0.06)'}}>
                      <span className="track-pill track-b" style={{marginBottom:'0.5rem',display:'inline-block'}}>Run</span>
                      <h4>Runtime Observations</h4>
                      <p>CloudTrail / GCP / DB logs compared against declared capabilities. Drift = alert.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <footer className="mkt-footer"><p>© 2026 VertaAI &nbsp;·&nbsp; <a href="mailto:hello@vertaai.io">hello@vertaai.io</a></p></footer>
          </>
        )}

        {/* ══════════════ INTEGRATIONS ══════════════ */}
        {section === 'integrations' && (
          <>
            <div className="mkt-section">
              <div className="label">Integrations</div>
              <h2>Every editor.<br/>Every cloud.</h2>
              <p className="lead" style={{marginTop:'1.25rem',marginBottom:'2.5rem'}}>VertaAI meets your team where they work — injecting governance into the tools already open on your developers' screens.</p>

              <h3 style={{color:'var(--muted)',textTransform:'uppercase',fontSize:'0.65rem',letterSpacing:'0.14em',fontWeight:800,marginBottom:'1rem'}}>AI Coding Editors — Track 0 config delivery</h3>
              <div className="int-grid">
                {[
                  ['🤖','Claude Code','.claude/CLAUDE.md · MCP tool: check_capability_intent + get_governance_status'],
                  ['🐙','GitHub Copilot','.github/copilot-instructions.md — permission envelope auto-appended'],
                  ['⚡','Cursor','.cursor/rules/vertaai-permissions.mdc (alwaysApply: true) · CodeLens + SSE Track 1'],
                  ['🌊','Windsurf','.windsurfrules project rules + MCP server for live queries + SSE Track 1'],
                  ['🔮','Augment','.augment/settings.json guidelines field + MCP transport'],
                ].map(([icon,name,desc]) => (
                  <div key={name as string} className="int-card">
                    <div className="int-icon">{icon}</div>
                    <div className="int-name">{name}</div>
                    <div className="int-desc">{desc}</div>
                  </div>
                ))}
              </div>

              <h3 style={{color:'var(--muted)',textTransform:'uppercase',fontSize:'0.65rem',letterSpacing:'0.14em',fontWeight:800,marginTop:'3rem',marginBottom:'1rem'}}>Runtime Observation Sources — Track B ingestion</h3>
              <div className="int-grid">
                {[
                  ['☁️','AWS CloudTrail','High-confidence (0.95) event ingestion with cross-service correlation and dedup','0.95'],
                  ['🌐','GCP Audit Logs','insertId-based global deduplication. Confidence-weighted severity.','0.95'],
                  ['🗄️','DB Query Logs','1-hour time-bucket dedup. Flags undeclared schema_modify and db_admin usage.','0.75'],
                ].map(([icon,name,desc,conf]) => (
                  <div key={name as string} className="int-card">
                    <div className="int-icon">{icon}</div>
                    <div className="int-name">{name}</div>
                    <div className="int-desc">{desc}</div>
                    <span className={`badge ${parseFloat(conf as string) >= 0.9 ? 'badge-green' : 'badge-amber'}`}>Confidence: {conf}</span>
                  </div>
                ))}
              </div>

              <h3 style={{color:'var(--muted)',textTransform:'uppercase',fontSize:'0.65rem',letterSpacing:'0.14em',fontWeight:800,marginTop:'3rem',marginBottom:'1rem'}}>In-Editor Push — Track 1 delivery</h3>
              <div className="int-grid" style={{gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))'}}>
                {[
                  ['⚡','SSE Push (Server-Sent Events)','Real-time governance events pushed to open editors when production drift is detected. No polling. No page refresh.'],
                  ['🔍','VSCode CodeLens','Inline annotation above every AI-authored function: agent · PR number · governance quality score (0–100).'],
                ].map(([icon,name,desc]) => (
                  <div key={name as string} className="int-card">
                    <div className="int-icon">{icon}</div>
                    <div className="int-name">{name}</div>
                    <div className="int-desc">{desc}</div>
                    <span className="badge badge-orange">Track 1</span>
                  </div>
                ))}
              </div>

              <h3 style={{color:'var(--muted)',textTransform:'uppercase',fontSize:'0.65rem',letterSpacing:'0.14em',fontWeight:800,marginTop:'3rem',marginBottom:'1rem'}}>Alerting — Track B escalation</h3>
              <div className="int-grid" style={{gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))'}}>
                {[
                  ['🔔','PagerDuty','Events API v2. CRITICAL effective severity (decay + confidence adjusted) triggers incidents.'],
                  ['💬','Slack','Rich drift notifications with capability, service, remediation options, and correlation signals.'],
                  ['🐙','GitHub Checks','Blocking check on every PR. Multi-pack most-restrictive-wins conflict resolution.'],
                ].map(([icon,name,desc]) => (
                  <div key={name as string} className="int-card">
                    <div className="int-icon">{icon}</div>
                    <div className="int-name">{name}</div>
                    <div className="int-desc">{desc}</div>
                  </div>
                ))}
              </div>

              <div style={{marginTop:'3rem'}}>
                <div className="label">MCP Protocol</div>
                <h3 style={{marginBottom:'1rem',fontSize:'1.1rem'}}>Three governance tools available to any MCP-compatible agent</h3>
                <div className="terminal" style={{marginTop:'1rem'}}>
                  <div className="terminal-bar">
                    <div className="terminal-dot" style={{background:'#ff5f57'}}></div><div className="terminal-dot" style={{background:'#febc2e'}}></div><div className="terminal-dot" style={{background:'#28c840'}}></div>
                    <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>MCP tools — Claude / Cursor / Windsurf</span>
                  </div>
                  <div className="terminal-body">
                    <div className="t-ok">check_capability_intent</div>
                    <div className="t-out">&nbsp; → Pre-flight: is this capability allowed under current workspace policy?</div>
                    <div className="t-ok" style={{marginTop:'0.5rem'}}>get_governance_status</div>
                    <div className="t-out">&nbsp; → Returns full markdown: active packs, permission envelope, session budgets, recent drift</div>
                    <div className="t-ok" style={{marginTop:'0.5rem'}}>report_capability_usage</div>
                    <div className="t-out">&nbsp; → Ingest a capability observation from within an agent session</div>
                  </div>
                </div>
              </div>
            </div>
            <footer className="mkt-footer"><p>© 2026 VertaAI &nbsp;·&nbsp; <a href="mailto:hello@vertaai.io">hello@vertaai.io</a></p></footer>
          </>
        )}

        {/* ══════════════ SECURITY ══════════════ */}
        {section === 'security' && (
          <>
            <div className="mkt-section">
              <div className="label">Security Model</div>
              <h2>12 capabilities.<br/>One permission model.</h2>
              <p className="lead" style={{marginTop:'1.25rem',marginBottom:'2rem'}}>VertaAI's permission envelope covers 12 real cloud and infrastructure capability types. Every capability has a default enforcement level that operators tighten via Policy Pack wizard.</p>

              <h3 style={{marginBottom:'1rem',fontSize:'1rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--muted)'}}>Blocked by Default — CRITICAL</h3>
              <div className="perm-grid">
                {['iam_modify','secret_write','db_admin','infra_delete','deployment_modify'].map(c => (
                  <div key={c} className="perm-card"><div className="perm-cap">{c}</div><span className="badge badge-red">BLOCKED</span></div>
                ))}
              </div>

              <h3 style={{marginTop:'2.5rem',marginBottom:'1rem',fontSize:'1rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--muted)'}}>Require Declaration — HIGH</h3>
              <div className="perm-grid">
                {['s3_delete','s3_write','schema_modify','network_public','infra_create','infra_modify','secret_read'].map(c => (
                  <div key={c} className="perm-card"><div className="perm-cap">{c}</div><span className="badge badge-amber">DECLARE</span></div>
                ))}
              </div>

              <div style={{marginTop:'3.5rem'}}>
                <div className="label">Agent Policy UI</div>
                <h3 style={{marginBottom:'0.75rem'}}>Configure everything in the Policy Pack wizard — no YAML hand-editing.</h3>
                <p style={{color:'var(--muted)',fontSize:'0.9rem',marginBottom:'1.5rem'}}>The Agent Policy tab lets operators escalate capabilities, require human approval, and set per-session budgets. All packs compile into a single effective envelope — most-restrictive wins.</p>
                <div className="terminal">
                  <div className="terminal-bar">
                    <div className="terminal-dot" style={{background:'#ff5f57'}}></div><div className="terminal-dot" style={{background:'#febc2e'}}></div><div className="terminal-dot" style={{background:'#28c840'}}></div>
                    <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>Policy Pack YAML · security-baseline · agentPolicy block</span>
                  </div>
                  <div className="terminal-body">
                    <div className="t-dim">agentPolicy:</div>
                    <div className="t-dim">&nbsp; additionalBlocked: [s3_write, infra_create]  # escalated from DECLARE → BLOCKED</div>
                    <div className="t-dim">&nbsp; requireApproval: [schema_modify]               # needs human sign-off before merge</div>
                    <div className="t-dim">&nbsp; sessionBudgets:</div>
                    <div className="t-dim">&nbsp;&nbsp;&nbsp; maxFilesChanged: 15</div>
                    <div className="t-dim">&nbsp;&nbsp;&nbsp; maxNewAbstractions: 2</div>
                  </div>
                </div>
              </div>

              <div style={{marginTop:'3.5rem'}}>
                <div className="label">Chain of Custody</div>
                <h3 style={{marginBottom:'1.5rem'}}>Complete audit trail — from intent declaration to production observation.</h3>
                <div style={{border:'1px solid rgba(255,255,255,0.07)',borderRadius:'12px',overflow:'hidden'}}>
                  <div style={{background:'var(--surface)',padding:'0.75rem 1.25rem',borderBottom:'1px solid rgba(255,255,255,0.07)',fontSize:'0.72rem',color:'var(--muted)',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em'}}>Audit Trail — Spec → Build → Run → Editor</div>
                  <div style={{padding:'0 1.25rem'}}>
                    {[
                      ['14:05','SPEC','purple','IntentArtifact created — cursor/gpt-4o · declared: [s3_write, schema_modify]'],
                      ['14:18','PR GATE','blue','Track A evaluation: 5/5 comparators · quality: 84/100 · PASS'],
                      ['14:31','MERGED','green','PR #142 merged · specBuildFindings stored · merge anchor recorded'],
                      ['17:44','DRIFT','amber','iam_modify observed via CloudTrail — not declared in intent artifact'],
                      ['17:44','PAGERDUTY','red','PD-291847 created · Slack #ai-governance notified'],
                      ['17:44','TRACK 1','orange','In-editor SSE alert pushed to open userService.ts — developer notified in context'],
                    ].map(([time,label,color,msg]) => (
                      <div key={label as string} className="audit-row">
                        <span className="audit-time">2026-03-05 {time} UTC</span>
                        <span><span className={`badge badge-${color}`}>{label}</span> &nbsp;{msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <footer className="mkt-footer"><p>© 2026 VertaAI &nbsp;·&nbsp; <a href="mailto:hello@vertaai.io">hello@vertaai.io</a></p></footer>
          </>
        )}

        {/* ══════════════ SOLUTIONS ══════════════ */}
        {section === 'solutions' && (
          <>
            <div className="mkt-section">
              <div className="label">Solutions</div>
              <h2>One platform.<br/>Full alignment.</h2>
              <p className="lead" style={{marginTop:'1.25rem'}}>Whether you own code quality, engineering velocity, or security posture — VertaAI speaks your language.</p>

              <div className="persona-grid">

                {/* Tech Lead */}
                <div className="persona-card" style={{borderColor:'rgba(99,102,241,0.2)'}}>
                  <div className="persona-tag" style={{color:'#a5b4fc'}}>For the Tech Lead</div>
                  <h3>Speed without<br/>the blast radius.</h3>
                  <p>VertaAI gives tech leads the control layer they've been missing — spaghetti prevention, provenance debugging, and live governance alerts in the editor.</p>
                  <ul className="persona-bullets">
                    <li>CodeLens inline: agent · PR · quality score — know exactly who wrote what</li>
                    <li>Spaghetti prevention: session budgets + abstraction risk flagged before merge</li>
                    <li>Live Track 1 alerts in your editor — no context switch needed</li>
                    <li>5 automated comparators on every AI-authored PR</li>
                    <li>Quality score (0–100) across 5 governance dimensions</li>
                  </ul>
                  <div className="outcome-chip outcome-indigo">Outcome: Zero Ungoverned PRs</div>
                </div>

                {/* Engineering Manager */}
                <div className="persona-card" style={{borderColor:'rgba(16,185,129,0.2)'}}>
                  <div className="persona-tag" style={{color:'#6ee7b7'}}>For the Engineering Manager</div>
                  <h3>Kill the<br/>chaos drift.</h3>
                  <p>VertaAI gives engineering managers workspace-level policy controls and real-time visibility across all 5 AI editors — without reviewing every PR yourself.</p>
                  <ul className="persona-bullets">
                    <li>Policy Pack wizard: capability rules, budgets, spaghetti limits — no YAML</li>
                    <li>Active Agent Permission Envelope: see exactly what every agent can do now</li>
                    <li>Exception waivers with expiry dates and full audit trail</li>
                    <li>Works across all 5 editors — no need to standardize toolchain</li>
                    <li>Track 1 active status: SSE push to open editors across the team</li>
                  </ul>
                  <div className="outcome-chip outcome-green">Outcome: Operational Integrity</div>
                </div>

                {/* CISO */}
                <div className="persona-card" style={{borderColor:'rgba(251,146,60,0.2)'}}>
                  <div className="persona-tag" style={{color:'#fdba74'}}>For the CISO</div>
                  <h3>The liability<br/>shield.</h3>
                  <p>VertaAI gives security teams the visibility, controls, and audit trail needed to govern AI coding agents under SOC 2, ISO 27001, and internal security policy.</p>
                  <ul className="persona-bullets">
                    <li>5 critical capabilities blocked by default: iam_modify, secret_write, db_admin…</li>
                    <li>Runtime drift detected within minutes via CloudTrail (0.95 confidence)</li>
                    <li>Chain-of-custody: intent artifact → PR findings → runtime observations</li>
                    <li>PagerDuty for CRITICAL drift — gated by recency decay + source confidence</li>
                    <li>Human approval gate for schema_modify and HIGH capabilities</li>
                  </ul>
                  <div className="outcome-chip outcome-orange">Outcome: Deterministic Audit Trail</div>
                </div>

              </div>

              <div style={{marginTop:'5rem',textAlign:'center',padding:'3rem',background:'rgba(15,23,42,0.6)',backdropFilter:'blur(16px)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:'24px'}}>
                <div className="label" style={{marginBottom:'1rem'}}>Early Access</div>
                <h2 style={{marginBottom:'1rem',fontSize:'clamp(1.5rem,3vw,2.5rem)'}}>Ready to govern your AI coding agents?</h2>
                <p style={{color:'var(--muted)',fontSize:'1rem',marginBottom:'2rem',maxWidth:'500px',margin:'0 auto 2rem'}}>VertaAI is in private early access. We're onboarding engineering teams deploying AI coding agents at scale.</p>
                <a href="mailto:hello@vertaai.io" className="btn-primary" style={{fontSize:'1rem',padding:'0.9rem 2.5rem'}}>Request Early Access →</a>
              </div>
            </div>
            <footer className="mkt-footer"><p>© 2026 VertaAI &nbsp;·&nbsp; <a href="mailto:hello@vertaai.io">hello@vertaai.io</a></p></footer>
          </>
        )}
      </div>
    </>
  );
}
