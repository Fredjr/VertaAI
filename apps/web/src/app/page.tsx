'use client';

import { useState } from 'react';
import Link from 'next/link';

type Section = 'platform' | 'howitworks' | 'integrations' | 'security' | 'solutions';
type Persona = 'tl' | 'em' | 'ciso';

export default function MarketingPage() {
  const [section, setSection] = useState<Section>('platform');
  const [persona, setPersona] = useState<Persona>('tl');

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0a0c0f; --surface: #111318; --surface2: #181c24;
          --border: #1f2533; --border2: #2a3347;
          --text: #e8eaf0; --muted: #8090a8;
          --accent: #6366f1; --accent2: #818cf8;
          --amber: #f59e0b; --green: #10b981; --red: #ef4444;
          --blue: #3b82f6; --purple: #a855f7; --orange: #f97316;
        }
        body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
        .mkt { min-height: 100vh; }
        /* NAV */
        .mkt-nav { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; justify-content: space-between; padding: 0 2rem; height: 60px; background: rgba(10,12,15,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
        .mkt-logo { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text); }
        .mkt-logo span { color: var(--accent2); }
        .mkt-nav-links { display: flex; gap: 0.25rem; list-style: none; }
        .mkt-nav-links button { display: block; padding: 0.4rem 0.75rem; font-size: 0.875rem; color: var(--muted); background: none; border: none; border-radius: 6px; cursor: pointer; transition: color 0.15s, background 0.15s; }
        .mkt-nav-links button:hover, .mkt-nav-links button.active { color: var(--text); background: var(--surface2); }
        .mkt-nav-cta { background: var(--accent); color: #fff; padding: 0.4rem 1.1rem; font-size: 0.875rem; font-weight: 600; border: none; border-radius: 7px; cursor: pointer; text-decoration: none; transition: background 0.15s; display: flex; align-items: center; gap: 0.5rem; }
        .mkt-nav-cta:hover { background: var(--accent2); }
        /* LAYOUT */
        .mkt-section { padding: 5rem 1.5rem; max-width: 1100px; margin: 0 auto; }
        h1 { font-size: clamp(2.2rem,5vw,3.6rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; }
        h2 { font-size: clamp(1.6rem,3vw,2.2rem); font-weight: 700; letter-spacing: -0.02em; }
        h3 { font-size: 1.1rem; font-weight: 600; }
        .label { display: inline-block; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent2); background: rgba(99,102,241,0.12); padding: 0.2rem 0.6rem; border-radius: 4px; margin-bottom: 1rem; }
        .label-orange { color: #fdba74; background: rgba(251,146,60,0.12); }
        .gradient-text { background: linear-gradient(135deg,#818cf8 0%,#a78bfa 50%,#6ee7b7 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .muted { color: var(--muted); }
        .lead { font-size: 1.15rem; color: var(--muted); max-width: 640px; line-height: 1.7; }
        .grid-2 { display: grid; grid-template-columns: repeat(auto-fit,minmax(280px,1fr)); gap: 1.25rem; }
        .grid-3 { display: grid; grid-template-columns: repeat(auto-fit,minmax(230px,1fr)); gap: 1.25rem; }
        .grid-4 { display: grid; grid-template-columns: repeat(auto-fit,minmax(210px,1fr)); gap: 1.25rem; }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
        .card:hover { border-color: var(--border2); }
        .card-icon { width: 40px; height: 40px; background: var(--surface2); border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; margin-bottom: 1rem; }
        /* TERMINAL */
        .terminal { background: #0d1117; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; font-family: 'SF Mono','Fira Code',monospace; font-size: 0.82rem; }
        .terminal-bar { display: flex; align-items: center; gap: 6px; padding: 0.6rem 1rem; background: var(--surface); border-bottom: 1px solid var(--border); }
        .terminal-dot { width: 11px; height: 11px; border-radius: 50%; }
        .terminal-body { padding: 1.25rem; line-height: 1.7; }
        .t-ok { color: var(--green); } .t-warn { color: var(--amber); } .t-block { color: var(--red); }
        .t-out { color: var(--muted); } .t-dim { color: #4a5568; } .t-orange { color: #fdba74; }
        /* BADGES */
        .badge { display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.55rem; border-radius: 20px; }
        .badge-green { background: rgba(16,185,129,0.12); color: var(--green); }
        .badge-amber { background: rgba(245,158,11,0.12); color: var(--amber); }
        .badge-red   { background: rgba(239,68,68,0.12);  color: var(--red); }
        .badge-blue  { background: rgba(59,130,246,0.12); color: var(--blue); }
        .badge-purple{ background: rgba(168,85,247,0.12); color: var(--purple); }
        .badge-orange{ background: rgba(251,146,60,0.12); color: #fdba74; }
        /* TRACK PILLS */
        .track-pill { display: inline-block; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; padding: 0.2rem 0.7rem; border-radius: 20px; }
        .track-0 { background: rgba(168,85,247,0.15); color: #c4b5fd; border: 1px solid rgba(168,85,247,0.3); }
        .track-a { background: rgba(99,102,241,0.15);  color: #a5b4fc; border: 1px solid rgba(99,102,241,0.3); }
        .track-b { background: rgba(16,185,129,0.15);  color: #6ee7b7; border: 1px solid rgba(16,185,129,0.3); }
        .track-1 { background: rgba(251,146,60,0.15);  color: #fdba74; border: 1px solid rgba(251,146,60,0.3); }
        /* HERO */
        .hero { min-height: calc(100vh - 60px); display: flex; flex-direction: column; justify-content: center; padding: 4rem 1.5rem 3rem; max-width: 1100px; margin: 0 auto; }
        .hero-sub { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.75rem; flex-wrap: wrap; }
        .hero-desc { margin: 1.5rem 0 2rem; }
        .hero-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .btn-primary { background: var(--accent); color: #fff; padding: 0.7rem 1.4rem; font-size: 0.95rem; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; text-decoration: none; display: inline-block; transition: background 0.15s; }
        .btn-primary:hover { background: var(--accent2); }
        .btn-secondary { background: var(--surface); color: var(--text); padding: 0.7rem 1.4rem; font-size: 0.95rem; font-weight: 600; border: 1px solid var(--border2); border-radius: 8px; cursor: pointer; text-decoration: none; display: inline-block; transition: border-color 0.15s; }
        .btn-secondary:hover { border-color: var(--accent); }
        .editor-strip { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 1.5rem 0 0; }
        .editor-chip { display: flex; align-items: center; gap: 0.4rem; background: var(--surface); border: 1px solid var(--border); padding: 0.35rem 0.75rem; border-radius: 20px; font-size: 0.8rem; color: var(--muted); }
        .stats-bar { display: grid; grid-template-columns: repeat(auto-fit,minmax(140px,1fr)); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-top: 4rem; }
        .stat { background: var(--surface); padding: 1.5rem; text-align: center; }
        .stat-num { font-size: 2rem; font-weight: 800; color: var(--accent2); letter-spacing: -0.04em; }
        .stat-label { font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem; }
        /* TRACK CARDS */
        .track-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 2rem; position: relative; overflow: hidden; }
        .track-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
        .track-card.t0::before { background: linear-gradient(90deg,#a855f7,#7c3aed); }
        .track-card.ta::before { background: linear-gradient(90deg,#6366f1,#4f46e5); }
        .track-card.tb::before { background: linear-gradient(90deg,#10b981,#059669); }
        .track-card.t1::before { background: linear-gradient(90deg,#f97316,#ea580c); }
        .track-title { font-size: 1.1rem; font-weight: 700; margin: 0.75rem 0 0.5rem; }
        .track-desc  { font-size: 0.9rem; color: var(--muted); line-height: 1.6; }
        .track-bullets { list-style: none; margin-top: 1rem; }
        .track-bullets li { font-size: 0.85rem; color: var(--muted); padding: 0.2rem 0; display: flex; align-items: flex-start; gap: 0.5rem; }
        .track-bullets li::before { content: '→'; color: var(--accent2); flex-shrink: 0; }
        /* PIPELINE DIAGRAM */
        .pipeline-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 1.5rem; margin: 2.5rem 0; }
        .pipeline-wrap h4 { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 1.25rem; }
        .pipeline { display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem; }
        .pipeline-node { border: 1px solid var(--border); border-radius: 9px; padding: 0.75rem 0.9rem; text-align: center; min-width: 90px; flex: 1; }
        .pipeline-node.p-neutral { background: var(--surface2); }
        .pipeline-node.p0 { border-color: rgba(168,85,247,0.5); background: rgba(168,85,247,0.08); }
        .pipeline-node.pa { border-color: rgba(99,102,241,0.5); background: rgba(99,102,241,0.08); }
        .pipeline-node.pb { border-color: rgba(16,185,129,0.5); background: rgba(16,185,129,0.08); }
        .pipeline-node.p1 { border-color: rgba(251,146,60,0.5); background: rgba(251,146,60,0.08); }
        .pipeline-node .pn-track { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.2rem; }
        .p0 .pn-track { color: #c4b5fd; } .pa .pn-track { color: #a5b4fc; } .pb .pn-track { color: #6ee7b7; } .p1 .pn-track { color: #fdba74; }
        .pipeline-node .pn-title { font-size: 0.78rem; font-weight: 600; color: var(--text); line-height: 1.3; }
        .pipeline-arrow { color: var(--muted); font-size: 0.9rem; flex-shrink: 0; padding: 0 0.1rem; }
        .pipeline-loop-row { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed rgba(251,146,60,0.35); font-size: 0.75rem; color: #fdba74; }
        /* TIMELINE */
        .timeline-item { display: grid; grid-template-columns: 48px 1fr; gap: 1.25rem; margin-bottom: 2.5rem; }
        .timeline-number { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; font-weight: 800; flex-shrink: 0; }
        .tn-0 { background: rgba(168,85,247,0.2); color: #c4b5fd; }
        .tn-a { background: rgba(99,102,241,0.2); color: #a5b4fc; }
        .tn-b { background: rgba(16,185,129,0.2); color: #6ee7b7; }
        .tn-1 { background: rgba(251,146,60,0.2); color: #fdba74; }
        .timeline-content { padding-top: 0.6rem; }
        .timeline-content h3 { font-size: 1.1rem; margin-bottom: 0.35rem; }
        .timeline-content p  { color: var(--muted); font-size: 0.9rem; margin-bottom: 1rem; }
        /* QUALITY SCORE */
        .quality-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(150px,1fr)); gap: 0.75rem; margin-top: 1.25rem; }
        .quality-card { background: var(--surface); border: 1px solid var(--border); border-radius: 9px; padding: 0.85rem; }
        .quality-label { font-size: 0.72rem; color: var(--muted); margin-bottom: 0.5rem; }
        .quality-score { font-size: 1.1rem; font-weight: 800; color: var(--accent2); }
        .quality-bar-track { background: var(--surface2); border-radius: 4px; height: 3px; margin-top: 0.4rem; }
        .quality-bar-fill { height: 3px; border-radius: 4px; }
        /* SPEC→BUILD→RUN */
        .sbr-wrap { display: grid; grid-template-columns: 1fr 32px 1fr 32px 1fr; gap: 0.5rem; align-items: center; margin: 2rem 0; }
        .sbr-node { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; text-align: center; }
        .sbr-node h4 { font-size: 0.85rem; font-weight: 700; margin-bottom: 0.35rem; }
        .sbr-node p { font-size: 0.78rem; color: var(--muted); line-height: 1.5; }
        .sbr-arrow { text-align: center; color: var(--muted); font-size: 1.2rem; }
        /* PERM GRID */
        .perm-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(190px,1fr)); gap: 0.75rem; margin-top: 1.5rem; }
        .perm-card { background: var(--surface); border: 1px solid var(--border); border-radius: 9px; padding: 0.9rem 1rem; }
        .perm-cap { font-family: 'SF Mono',monospace; font-size: 0.78rem; color: var(--text); margin-bottom: 0.35rem; }
        /* INT GRID */
        .int-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(180px,1fr)); gap: 1rem; margin-top: 2rem; }
        .int-card { background: var(--surface); border: 1px solid var(--border); border-radius: 11px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .int-icon { font-size: 1.8rem; } .int-name { font-weight: 600; font-size: 0.9rem; } .int-desc { font-size: 0.8rem; color: var(--muted); }
        /* SPAGHETTI COMPARISON */
        .comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-top: 1.5rem; }
        .comparison-bad { background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.2); border-radius: 12px; padding: 1.25rem; }
        .comparison-good { background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.2); border-radius: 12px; padding: 1.25rem; }
        .comparison-header { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.75rem; }
        .comparison-bad .comparison-header { color: var(--red); }
        .comparison-good .comparison-header { color: var(--green); }
        .comparison-item { font-size: 0.82rem; color: var(--muted); padding: 0.2rem 0; display: flex; gap: 0.5rem; }
        /* AUDIT TRAIL */
        .audit-row { display: flex; gap: 1rem; align-items: flex-start; padding: 0.9rem 0; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
        .audit-row:last-child { border-bottom: none; }
        .audit-time { color: var(--muted); font-family: monospace; white-space: nowrap; min-width: 130px; }
        /* PERSONA */
        .persona-tabs { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 2rem; }
        .persona-tab { padding: 0.5rem 1.1rem; border-radius: 7px; font-size: 0.875rem; font-weight: 600; cursor: pointer; background: var(--surface); border: 1px solid var(--border); color: var(--muted); transition: all 0.15s; }
        .persona-tab.active { background: var(--accent); border-color: var(--accent); color: #fff; }
        /* FOOTER */
        .mkt-footer { border-top: 1px solid var(--border); padding: 2.5rem 1.5rem; text-align: center; color: var(--muted); font-size: 0.85rem; }
        .mkt-footer a { color: var(--muted); text-decoration: none; }
        .mkt-footer a:hover { color: var(--text); }
        code { font-family: 'SF Mono','Fira Code',monospace; font-size: 0.75rem; color: var(--accent2); }
        @media (max-width: 640px) { .mkt-nav { padding: 0 1rem; } .mkt-nav-links { display: none; } .mkt-section { padding: 3rem 1rem; } .comparison-grid { grid-template-columns: 1fr; } .sbr-wrap { grid-template-columns: 1fr; } .sbr-arrow { display: none; } }
      `}</style>

      <div className="mkt">
        {/* NAV */}
        <nav className="mkt-nav">
          <span className="mkt-logo">Verta<span>AI</span></span>
          <ul className="mkt-nav-links">
            {(['platform','howitworks','integrations','security','solutions'] as Section[]).map(s => (
              <li key={s}>
                <button className={section === s ? 'active' : ''} onClick={() => setSection(s)}>
                  {{ platform:'Platform', howitworks:'How It Works', integrations:'Integrations', security:'Security', solutions:'Solutions' }[s]}
                </button>
              </li>
            ))}
          </ul>
          <Link href="/policy-packs?workspace=demo-workspace" className="mkt-nav-cta">Open Dashboard →</Link>
        </nav>

        {/* ══════════════ PLATFORM ══════════════ */}
        {section === 'platform' && (
          <>
            <div className="hero">
              <div className="hero-sub">
                <span className="label">AI Agent Governance</span>
                <span className="track-pill track-0">Track 0 · Pre-flight</span>
                <span className="track-pill track-a">Track A · PR Gate</span>
                <span className="track-pill track-b">Track B · Runtime</span>
                <span className="track-pill track-1">Track 1 · In-Editor</span>
              </div>
              <h1>Stop runaway AI agents<br /><span className="gradient-text">before they ship.</span></h1>
              <p className="lead hero-desc">VertaAI enforces your engineering policies at every stage of the AI coding workflow — before an agent writes code, at PR review, in production, and back in the editor. Four tracks. One closed loop. Five editors.</p>
              <div className="hero-actions">
                <a href="mailto:hello@vertaai.io" className="btn-primary">Request Early Access</a>
                <button className="btn-secondary" onClick={() => setSection('howitworks')}>See How It Works →</button>
              </div>
              <div className="editor-strip">
                <span className="muted" style={{fontSize:'0.8rem',alignSelf:'center'}}>Works with:</span>
                {[['🤖','Claude Code'],['🐙','GitHub Copilot'],['⚡','Cursor'],['🌊','Windsurf'],['🔮','Augment']].map(([e,n]) => (
                  <div key={n} className="editor-chip"><span>{e}</span> {n}</div>
                ))}
              </div>
              <div className="stats-bar">
                {[['12','Capability types governed'],['5','AI coding editors'],['4','Enforcement layers'],['100','Agent quality score (0–100)'],['60s','Permission cache TTL']].map(([n,l]) => (
                  <div key={l} className="stat"><div className="stat-num">{n}</div><div className="stat-label">{l}</div></div>
                ))}
              </div>
            </div>

            {/* PROBLEM */}
            <div className="mkt-section">
              <div className="label">The Problem</div>
              <h2>AI agents are coding blind — and nobody is watching.</h2>
              <p className="lead" style={{marginTop:'1rem',marginBottom:'3rem'}}>Copilot, Cursor, Claude Code, Windsurf — each operates in isolation. They don&apos;t know your IAM policy, your off-limits services, or your runbook. Worse: when they generate 80 files for a 5-file ticket, or create the seventh version of the same utility function, there&apos;s nothing stopping them.</p>
              <div className="grid-3">
                {[
                  ['🔑','Capability Sprawl','Agents request IAM roles, write secrets, and modify infrastructure with no pre-flight check against your policy.'],
                  ['🕵️','Zero Provenance','When an incident hits, you can\'t trace which agent wrote the code, under what context, or with what declared intent — it\'s a black box.'],
                  ['🍝','Spaghetti Code','Unconstrained agents create N+1 utility functions, touch dozens of files, and generate duplicates. Without session budgets and abstraction scoring, sprawl compounds daily.'],
                ].map(([icon,title,desc]) => (
                  <div key={title} className="card">
                    <div className="card-icon">{icon}</div>
                    <h3>{title}</h3>
                    <p style={{fontSize:'0.875rem',color:'var(--muted)',marginTop:'0.5rem'}}>{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* PIPELINE DIAGRAM */}
            <div className="mkt-section" style={{paddingTop:'0'}}>
              <div className="label">The Closed-Loop Architecture</div>
              <h2>Four tracks. One source of truth.</h2>
              <p className="lead" style={{marginTop:'1rem',marginBottom:'1.5rem'}}>VertaAI intercepts the AI coding workflow at four moments — and closes the loop by pushing production intelligence back into the editor.</p>

              <div className="pipeline-wrap">
                <h4>Governance pipeline — left to right, then back</h4>
                <div className="pipeline">
                  <div className="pipeline-node p-neutral"><div className="pn-track" style={{color:'var(--muted)'}}>Start</div><div className="pn-title">Open Editor</div></div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-node p0"><div className="pn-track">Track 0</div><div className="pn-title">Permission Envelope</div></div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-node p-neutral"><div className="pn-track" style={{color:'var(--muted)'}}>Code</div><div className="pn-title">Agent Writes Code</div></div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-node pa"><div className="pn-track">Track A</div><div className="pn-title">PR Gate · 5 Checks</div></div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-node p-neutral"><div className="pn-track" style={{color:'var(--muted)'}}>Ship</div><div className="pn-title">Merge + Deploy</div></div>
                  <div className="pipeline-arrow">→</div>
                  <div className="pipeline-node pb"><div className="pn-track">Track B</div><div className="pn-title">Runtime Monitor</div></div>
                </div>
                <div className="pipeline-loop-row">
                  <span>⬑</span>
                  <span><strong>Track 1:</strong> Drift detected in production → alert pushed live into the developer&apos;s editor via SSE — no context switch required</span>
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
                <div className="track-card ta">
                  <span className="track-pill track-a">Track A</span>
                  <div className="track-title">YAML Policy Gate at PR Review</div>
                  <div className="track-desc">At pull request time, 5 automated comparators check intent parity, abstraction risk, churn, imports, and infra ownership. Posts as a blocking GitHub Check.</div>
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
                  <div className="track-desc">In production, VertaAI monitors CloudTrail, GCP Audit Logs, and DB query logs for undeclared capability usage. PagerDuty + Slack when CRITICAL drift appears.</div>
                  <ul className="track-bullets">
                    <li>AWS CloudTrail + GCP Audit ingestion</li>
                    <li>Decay-weighted severity scoring</li>
                    <li>Cross-service correlation signals</li>
                    <li>Auto-close when drift resolves</li>
                  </ul>
                </div>
                <div className="track-card t1">
                  <span className="track-pill track-1">Track 1</span>
                  <div className="track-title">In-Editor Governance Feedback</div>
                  <div className="track-desc">When production drift is detected, VertaAI pushes the alert directly into the developer&apos;s editor in real-time via SSE — no context switch, no Slack tab hunting.</div>
                  <ul className="track-bullets">
                    <li>Real-time SSE push to open editors</li>
                    <li>CodeLens: agent · PR · quality score</li>
                    <li>Closes the governance loop</li>
                    <li>Alert surfaced where code lives</li>
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
              <h2>Four enforced stages. One feedback loop.</h2>
              <p className="lead" style={{marginTop:'1rem',marginBottom:'2rem'}}>Every AI-generated code change flows through the VertaAI governance pipeline — and production intelligence flows back to the editor.</p>

              {/* Pipeline diagram */}
              <div className="pipeline-wrap">
                <h4>End-to-end governance pipeline</h4>
                <div className="pipeline">
                  {[
                    {cls:'p-neutral',track:'',title:'Open Editor'},
                    null,
                    {cls:'p0',track:'Track 0',title:'Permission Envelope'},
                    null,
                    {cls:'p-neutral',track:'',title:'Write Code'},
                    null,
                    {cls:'pa',track:'Track A',title:'PR Gate'},
                    null,
                    {cls:'p-neutral',track:'',title:'Merge + Deploy'},
                    null,
                    {cls:'pb',track:'Track B',title:'Runtime Monitor'},
                  ].map((node,i) => node === null
                    ? <div key={i} className="pipeline-arrow">→</div>
                    : <div key={i} className={`pipeline-node ${node.cls}`}>
                        {node.track && <div className="pn-track">{node.track}</div>}
                        <div className="pn-title">{node.title}</div>
                      </div>
                  )}
                </div>
                <div className="pipeline-loop-row">
                  <span>⬑</span>
                  <strong>Track 1:</strong> drift detected → alert pushed to editor in real-time via SSE
                </div>
              </div>

              {/* Track 0 */}
              <div className="timeline-item" style={{marginTop:'3rem'}}>
                <div className="timeline-number tn-0">0</div>
                <div className="timeline-content">
                  <span className="track-pill track-0" style={{marginBottom:'0.5rem',display:'inline-block'}}>Track 0 · Pre-flight</span>
                  <h3>Permission envelope compiled and injected into every editor</h3>
                  <p>Before any code is written, VertaAI compiles a permission envelope from active Policy Packs and pushes it to all 5 editors automatically — on setup and on every policy change.</p>
                  <div className="terminal">
                    <div className="terminal-bar">
                      <div className="terminal-dot" style={{background:'#ff5f57'}}></div><div className="terminal-dot" style={{background:'#febc2e'}}></div><div className="terminal-dot" style={{background:'#28c840'}}></div>
                      <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>.cursor/rules/vertaai-permissions.mdc</span>
                    </div>
                    <div className="terminal-body">
                      <div className="t-dim">--- alwaysApply: true ---</div>
                      <div className="t-block" style={{marginTop:'0.5rem'}}>🚫 BLOCKED: iam_modify · secret_write · db_admin · infra_delete · deployment_modify</div>
                      <div className="t-warn" style={{marginTop:'0.25rem'}}>⚠️ DECLARE BEFORE USE: s3_delete · s3_write · schema_modify · network_public · infra_create · infra_modify · secret_read</div>
                      <div className="t-ok" style={{marginTop:'0.25rem'}}>📋 SESSION BUDGETS: max 20 files · max 3 new abstractions per session</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Track A */}
              <div className="timeline-item">
                <div className="timeline-number tn-a">A</div>
                <div className="timeline-content">
                  <span className="track-pill track-a" style={{marginBottom:'0.5rem',display:'inline-block'}}>Track A · PR Gate</span>
                  <h3>5 automated comparators run on every AI-authored PR</h3>
                  <p>When a PR is opened, VertaAI evaluates five governance checks against the code, declared intent artifact, and active Policy Packs. A blocking GitHub Check posts the result.</p>
                  <div className="terminal">
                    <div className="terminal-bar">
                      <div className="terminal-dot" style={{background:'#ff5f57'}}></div><div className="terminal-dot" style={{background:'#febc2e'}}></div><div className="terminal-dot" style={{background:'#28c840'}}></div>
                      <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>GitHub Check · VertaAI Policy Gate · PR #142</span>
                    </div>
                    <div className="terminal-body">
                      <div className="t-ok">✓ INTENT_CAPABILITY_PARITY &nbsp;&nbsp; Declared: [s3_write, schema_modify] · Undeclared: none</div>
                      <div className="t-ok">✓ CHURN_COMPLEXITY_RISK &nbsp;&nbsp;&nbsp;&nbsp; Lines: 847 · Threshold: 1200 · PASS</div>
                      <div className="t-warn">⚠ DUPLICATE_ABSTRACTION_RISK  Similarity: 0.78 with UserAuthService.ts · medium risk flagged</div>
                      <div className="t-ok">✓ OVERPERMISSIONED_IMPORT &nbsp;&nbsp; ✓ INFRA_OWNERSHIP_PARITY</div>
                      <div className="t-ok" style={{marginTop:'0.5rem'}}>Result: PASS &nbsp;·&nbsp; Quality Score: 84/100 &nbsp;·&nbsp; Merge allowed</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Track B */}
              <div className="timeline-item">
                <div className="timeline-number tn-b">B</div>
                <div className="timeline-content">
                  <span className="track-pill track-b" style={{marginBottom:'0.5rem',display:'inline-block'}}>Track B · Runtime</span>
                  <h3>Continuous drift detection across CloudTrail, GCP, and DB logs</h3>
                  <p>Post-deploy, VertaAI ingests AWS CloudTrail, GCP Audit Logs, and DB query logs. Undeclared capability usage surfaces as a DriftCluster with decay-weighted severity and A/B/C remediation options.</p>
                  <div className="terminal">
                    <div className="terminal-bar">
                      <div className="terminal-dot" style={{background:'#ff5f57'}}></div><div className="terminal-dot" style={{background:'#febc2e'}}></div><div className="terminal-dot" style={{background:'#28c840'}}></div>
                      <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>Runtime drift monitor · user-service</span>
                    </div>
                    <div className="terminal-body">
                      <div className="t-block">🚨 DRIFT · user-service · iam_modify (not declared in intent artifact)</div>
                      <div className="t-out">Source: CloudTrail (confidence: 0.95) · First seen: 3h ago · 47 events</div>
                      <div className="t-warn">Effective severity: CRITICAL (recency: 1.0× · confidence: 0.95)</div>
                      <div className="t-out">Correlation: iam_modify shared across [user-service, auth-service]</div>
                      <div className="t-out" style={{marginTop:'0.25rem'}}>Remediation A: Remove policy attachment &nbsp;·&nbsp; B: Add permission boundary &nbsp;·&nbsp; C: Declare + get approval</div>
                      <div className="t-out">PagerDuty: PD-291847 &nbsp;·&nbsp; Slack: #ai-governance &nbsp;·&nbsp; → Track 1 push sent to editor</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Track 1 */}
              <div className="timeline-item">
                <div className="timeline-number tn-1">1</div>
                <div className="timeline-content">
                  <span className="track-pill track-1" style={{marginBottom:'0.5rem',display:'inline-block'}}>Track 1 · In-Editor</span>
                  <h3>Production drift surfaces in the editor — not just Slack</h3>
                  <p>When Track B detects drift in production, VertaAI pushes a real-time governance event via SSE directly into the developer&apos;s open editor. The developer sees the alert in context — right where the code lives — without switching tabs or waiting for an on-call ping.</p>
                  <div className="terminal">
                    <div className="terminal-bar">
                      <div className="terminal-dot" style={{background:'#ff5f57'}}></div><div className="terminal-dot" style={{background:'#febc2e'}}></div><div className="terminal-dot" style={{background:'#28c840'}}></div>
                      <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>userService.ts — VertaAI In-Editor Alert</span>
                    </div>
                    <div className="terminal-body">
                      <div className="t-orange">⚡ VertaAI [Track 1] — Production drift detected in this file&apos;s service</div>
                      <div className="t-out">&nbsp;&nbsp;Capability: iam_modify &nbsp;·&nbsp; Source: CloudTrail &nbsp;·&nbsp; Severity: CRITICAL</div>
                      <div className="t-out">&nbsp;&nbsp;This capability was not declared in intent artifact for PR #142</div>
                      <div className="t-out" style={{marginTop:'0.25rem'}}>&nbsp;&nbsp;Remediation A: Remove policy attachment from role arn:aws:iam::123:role/UserServiceRole</div>
                      <div className="t-out">&nbsp;&nbsp;[View full drift cluster →] &nbsp;·&nbsp; [Mark as declared →] &nbsp;·&nbsp; [Open PagerDuty →]</div>
                      <div className="t-ok" style={{marginTop:'0.5rem'}}>🤖 agent · PR #142 | Quality: 84/100</div>
                      <div className="t-out">export async function createUser(data: CreateUserInput) &#123;</div>
                      <div className="t-out">&nbsp; const user = await db.user.create(&#123; data &#125;);</div>
                      <div className="t-out">&nbsp; return user;</div>
                      <div className="t-out">&#125;</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SPAGHETTI PREVENTION */}
              <div style={{marginTop:'4rem',paddingTop:'3rem',borderTop:'1px solid var(--border)'}}>
                <div className="label label-orange">Spaghetti Prevention</div>
                <h2>Unconstrained agents sprawl. VertaAI sets the guardrails.</h2>
                <p className="lead" style={{marginTop:'1rem',marginBottom:'1.5rem'}}>AI coding agents left without constraints will create the 7th version of the same utility function, touch 80 files for a 5-file ticket, and generate N+1 abstractions until your codebase is unmaintainable. VertaAI prevents this at the source.</p>
                <div className="comparison-grid">
                  <div className="comparison-bad">
                    <div className="comparison-header">❌ Without VertaAI</div>
                    {[
                      'Agent creates UserAuthHelper, AuthUtil, AuthHelper, AuthService, UserAuth… (7th time)',
                      'PR touches 94 files for a single endpoint change',
                      'No churn limit: +3,200 lines added in one session',
                      'Duplicate abstraction detected only in code review — days later',
                      'No visibility into why agent chose this approach',
                    ].map(t => <div key={t} className="comparison-item"><span style={{color:'var(--red)'}}>✗</span><span>{t}</span></div>)}
                  </div>
                  <div className="comparison-good">
                    <div className="comparison-header">✓ With VertaAI</div>
                    {[
                      'DUPLICATE_ABSTRACTION_RISK comparator flags 0.78 similarity at PR time — before merge',
                      'Session budget: max 20 files per session — agent stops and declares intent',
                      'Churn threshold: 1,200 lines max — complex PRs require justification',
                      'Max 3 new abstractions per session — enforced by permission envelope',
                      'Intent artifact links every PR to declared purpose and quality score',
                    ].map(t => <div key={t} className="comparison-item"><span style={{color:'var(--green)'}}>✓</span><span>{t}</span></div>)}
                  </div>
                </div>
              </div>

              {/* PROVENANCE */}
              <div style={{marginTop:'4rem',paddingTop:'3rem',borderTop:'1px solid var(--border)'}}>
                <div className="label">Provenance &amp; Black Box Debugging</div>
                <h2>When an incident hits — you need to know who wrote it.</h2>
                <p className="lead" style={{marginTop:'1rem',marginBottom:'1.5rem'}}>VertaAI links every AI-generated function to the agent that wrote it, the PR it came from, and a governance quality score across 5 dimensions. Track 1 surfaces this inline in your editor the moment drift is detected.</p>

                {/* Quality score breakdown */}
                <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'12px',padding:'1.5rem',marginBottom:'1.5rem'}}>
                  <div style={{fontSize:'0.8rem',color:'var(--muted)',marginBottom:'1rem'}}>Agent Code Quality Score — 5 governance dimensions · 0–100 composite</div>
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

                {/* Spec→Build→Run */}
                <div style={{marginTop:'2rem'}}>
                  <div style={{fontSize:'0.75rem',color:'var(--muted)',marginBottom:'1rem',fontWeight:600}}>CHAIN OF CUSTODY — Spec → Build → Run</div>
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
              <h2>Every editor. Every cloud. Every alert channel.</h2>
              <p className="lead" style={{marginTop:'1rem',marginBottom:'2.5rem'}}>VertaAI meets your team where they work — injecting governance into the tools already open on your developers&apos; screens.</p>

              <h3 style={{color:'var(--muted)',textTransform:'uppercase',fontSize:'0.72rem',letterSpacing:'0.1em',marginBottom:'1rem'}}>AI Coding Editors — Track 0 config delivery</h3>
              <div className="int-grid">
                {[
                  ['🤖','Claude Code','.claude/CLAUDE.md · MCP tool: check_capability_intent + get_governance_status'],
                  ['🐙','GitHub Copilot','.github/copilot-instructions.md — permission envelope auto-appended'],
                  ['⚡','Cursor','.cursor/rules/vertaai-permissions.mdc (alwaysApply: true) · CodeLens + SSE Track 1'],
                  ['🌊','Windsurf','.windsurfrules project rules + MCP server for live queries + SSE Track 1'],
                  ['🔮','Augment','.augment/settings.json guidelines field + MCP transport'],
                ].map(([icon,name,desc]) => (
                  <div key={name} className="int-card">
                    <div className="int-icon">{icon}</div>
                    <div className="int-name">{name}</div>
                    <div className="int-desc">{desc}</div>
                  </div>
                ))}
              </div>

              <h3 style={{color:'var(--muted)',textTransform:'uppercase',fontSize:'0.72rem',letterSpacing:'0.1em',marginTop:'3rem',marginBottom:'1rem'}}>Runtime Observation Sources — Track B ingestion</h3>
              <div className="int-grid">
                {[
                  ['☁️','AWS CloudTrail','High-confidence (0.95) event ingestion with cross-service correlation and dedup','0.95'],
                  ['🌐','GCP Audit Logs','insertId-based global deduplication. Confidence-weighted severity.','0.95'],
                  ['🗄️','DB Query Logs','1-hour time-bucket dedup. Flags undeclared schema_modify and db_admin usage.','0.75'],
                ].map(([icon,name,desc,conf]) => (
                  <div key={name} className="int-card">
                    <div className="int-icon">{icon}</div>
                    <div className="int-name">{name}</div>
                    <div className="int-desc">{desc}</div>
                    <span className={`badge ${parseFloat(conf as string) >= 0.9 ? 'badge-green' : 'badge-amber'}`}>Confidence: {conf}</span>
                  </div>
                ))}
              </div>

              <h3 style={{color:'var(--muted)',textTransform:'uppercase',fontSize:'0.72rem',letterSpacing:'0.1em',marginTop:'3rem',marginBottom:'1rem'}}>In-Editor Push — Track 1 delivery</h3>
              <div className="int-grid" style={{gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))'}}>
                {[
                  ['⚡','SSE Push (Server-Sent Events)','Real-time governance events pushed to open editors when production drift is detected. No polling. No page refresh.'],
                  ['🔍','VSCode CodeLens','Inline annotation above every AI-authored function: agent · PR number · governance quality score (0–100).'],
                ].map(([icon,name,desc]) => (
                  <div key={name} className="int-card">
                    <div className="int-icon">{icon}</div>
                    <div className="int-name">{name}</div>
                    <div className="int-desc">{desc}</div>
                    <span className="badge badge-orange">Track 1</span>
                  </div>
                ))}
              </div>

              <h3 style={{color:'var(--muted)',textTransform:'uppercase',fontSize:'0.72rem',letterSpacing:'0.1em',marginTop:'3rem',marginBottom:'1rem'}}>Alerting — Track B escalation</h3>
              <div className="int-grid" style={{gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))'}}>
                {[
                  ['🔔','PagerDuty','Events API v2. CRITICAL effective severity (decay + confidence adjusted) triggers incidents.'],
                  ['💬','Slack','Rich drift notifications with capability, service, remediation options, and correlation signals.'],
                  ['🐙','GitHub Checks','Blocking check on every PR. Multi-pack most-restrictive-wins conflict resolution.'],
                ].map(([icon,name,desc]) => (
                  <div key={name} className="int-card">
                    <div className="int-icon">{icon}</div>
                    <div className="int-name">{name}</div>
                    <div className="int-desc">{desc}</div>
                  </div>
                ))}
              </div>

              <div style={{marginTop:'3rem'}}>
                <div className="label">MCP Protocol</div>
                <h3>Three governance tools available to any MCP-compatible agent</h3>
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
              <h2>A permission model built for the capabilities that matter.</h2>
              <p className="lead" style={{marginTop:'1rem',marginBottom:'2rem'}}>VertaAI&apos;s permission envelope covers 12 real cloud and infrastructure capability types — not vague categories. Every capability has a default enforcement level that operators tighten via the Policy Pack Agent Policy UI.</p>

              <h3 style={{marginBottom:'1rem'}}>Blocked by Default — CRITICAL</h3>
              <div className="perm-grid">
                {['iam_modify','secret_write','db_admin','infra_delete','deployment_modify'].map(c => (
                  <div key={c} className="perm-card"><div className="perm-cap">{c}</div><span className="badge badge-red">BLOCKED</span></div>
                ))}
              </div>

              <h3 style={{marginTop:'2.5rem',marginBottom:'1rem'}}>Require Declaration — HIGH</h3>
              <div className="perm-grid">
                {['s3_delete','s3_write','schema_modify','network_public','infra_create','infra_modify','secret_read'].map(c => (
                  <div key={c} className="perm-card"><div className="perm-cap">{c}</div><span className="badge badge-amber">DECLARE</span></div>
                ))}
              </div>

              <div style={{marginTop:'3.5rem'}}>
                <div className="label">Agent Policy UI</div>
                <h3>Operators configure everything in the Policy Pack wizard — no YAML hand-editing.</h3>
                <p style={{color:'var(--muted)',fontSize:'0.9rem',marginTop:'0.5rem',marginBottom:'1.5rem'}}>The Agent Policy tab lets operators add additional blocked capabilities, require human approval for specific ones, and set per-session budgets. All packs compile into a single effective envelope — most-restrictive wins. The workspace-level &quot;Active Agent Permission Envelope&quot; view shows exactly what every agent can do right now.</p>
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
                    <div className="t-dim">&nbsp;&nbsp;&nbsp; maxFilesChanged: 15       # overrides workspace default of 20</div>
                    <div className="t-dim">&nbsp;&nbsp;&nbsp; maxNewAbstractions: 2    # overrides workspace default of 3</div>
                  </div>
                </div>
              </div>

              <div style={{marginTop:'3.5rem'}}>
                <div className="label">Chain of Custody</div>
                <h3>Complete audit trail — from intent declaration to production observation.</h3>
                <div style={{border:'1px solid var(--border)',borderRadius:'12px',overflow:'hidden',marginTop:'1.5rem'}}>
                  <div style={{background:'var(--surface)',padding:'0.75rem 1.25rem',borderBottom:'1px solid var(--border)',fontSize:'0.8rem',color:'var(--muted)',fontWeight:600}}>Audit Trail — Spec → Build → Run → Editor</div>
                  <div style={{padding:'0 1.25rem'}}>
                    {[
                      ['14:05','SPEC','purple','IntentArtifact created — cursor/gpt-4o · declared: [s3_write, schema_modify]'],
                      ['14:18','PR GATE','blue','Track A evaluation: 5/5 comparators · quality: 84/100 · PASS'],
                      ['14:31','MERGED','green','PR #142 merged · specBuildFindings stored · merge anchor recorded'],
                      ['17:44','DRIFT','amber','iam_modify observed via CloudTrail — not declared in intent artifact'],
                      ['17:44','PAGERDUTY','red','PD-291847 created · Slack #ai-governance notified'],
                      ['17:44','TRACK 1','orange','In-editor SSE alert pushed to open userService.ts — developer notified in context'],
                    ].map(([time,label,color,msg]) => (
                      <div key={label} className="audit-row">
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
              <h2>Built for the teams responsible for what AI agents ship.</h2>
              <p className="lead" style={{marginTop:'1rem',marginBottom:'2.5rem'}}>Whether you&apos;re worried about code quality, spaghetti sprawl, security incidents, or audit readiness — VertaAI speaks your language.</p>

              <div className="persona-tabs">
                {([['tl','Tech Lead'],['em','Engineering Manager'],['ciso','CISO / Security']] as [Persona,string][]).map(([p,label]) => (
                  <button key={p} className={`persona-tab ${persona===p?'active':''}`} onClick={() => setPersona(p)}>{label}</button>
                ))}
              </div>

              {persona === 'tl' && (
                <div className="grid-2">
                  <div>
                    <h3 style={{fontSize:'1.4rem',marginBottom:'1rem'}}>You ship faster with AI. You also own the blast radius.</h3>
                    <p style={{color:'var(--muted)',fontSize:'0.95rem',marginBottom:'1.5rem'}}>VertaAI gives tech leads the control layer they&apos;ve been missing — spaghetti prevention, provenance debugging, and in-editor governance alerts.</p>
                    <ul style={{listStyle:'none',display:'flex',flexDirection:'column',gap:'0.75rem'}}>
                      {[
                        'CodeLens inline: agent · PR · quality score — know exactly who wrote what, instantly',
                        'Spaghetti prevention: session budgets + DUPLICATE_ABSTRACTION_RISK flag N+1 utility functions before merge',
                        'Track 1: drift detected in production pushes live into your editor — no context switch needed',
                        '5 automated Track A comparators on every AI-authored PR — churn, complexity, parity, imports, infra',
                        'Quality score (0–100) across 5 dimensions tells you if the agent\'s work is production-ready',
                      ].map(text => <li key={text} style={{display:'flex',gap:'0.75rem',fontSize:'0.9rem'}}><span style={{color:'var(--green)'}}>✓</span><span>{text}</span></li>)}
                    </ul>
                  </div>
                  <div className="terminal">
                    <div className="terminal-bar">
                      <div className="terminal-dot" style={{background:'#ff5f57'}}></div><div className="terminal-dot" style={{background:'#febc2e'}}></div><div className="terminal-dot" style={{background:'#28c840'}}></div>
                      <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>Weekly governance digest</span>
                    </div>
                    <div className="terminal-body">
                      <div className="t-ok">Team · AI Governance Week of Mar 3</div>
                      <div className="t-out" style={{marginTop:'0.5rem'}}>PRs evaluated: 34 &nbsp;·&nbsp; Pass rate: 91% (↑4%) &nbsp;·&nbsp; Avg quality: 79/100</div>
                      <div className="t-out">Session budgets triggered: 6 &nbsp;·&nbsp; Abstractions blocked: 4</div>
                      <div className="t-warn" style={{marginTop:'0.25rem'}}>Top findings: DUPLICATE_ABSTRACTION_RISK ×8 · INTENT_CAPABILITY_PARITY ×3</div>
                      <div className="t-ok" style={{marginTop:'0.25rem'}}>Runtime drift: 0 open clusters · Track 1 pushes: 2 (resolved) ✓</div>
                    </div>
                  </div>
                </div>
              )}

              {persona === 'em' && (
                <div className="grid-2">
                  <div>
                    <h3 style={{fontSize:'1.4rem',marginBottom:'1rem'}}>You&apos;re accountable for what your team&apos;s AI agents do at scale.</h3>
                    <p style={{color:'var(--muted)',fontSize:'0.95rem',marginBottom:'1.5rem'}}>VertaAI gives engineering managers workspace-level policy controls and real-time visibility — without reviewing every PR yourself.</p>
                    <ul style={{listStyle:'none',display:'flex',flexDirection:'column',gap:'0.75rem'}}>
                      {[
                        'Policy Pack wizard: set capability rules, session budgets, and spaghetti limits in a UI — no YAML',
                        'Active Agent Permission Envelope widget: see exactly what every agent is allowed to do right now',
                        'Spaghetti prevention: define max files/abstractions per session per pack — prevents agent sprawl at scale',
                        'Exception waivers with expiry dates — temporary overrides with full audit trail',
                        'Works across all 5 editors — no need to standardize your team\'s toolchain',
                      ].map(text => <li key={text} style={{display:'flex',gap:'0.75rem',fontSize:'0.9rem'}}><span style={{color:'var(--green)'}}>✓</span><span>{text}</span></li>)}
                    </ul>
                  </div>
                  <div className="card" style={{alignSelf:'start'}}>
                    <h3 style={{marginBottom:'1rem',fontSize:'0.9rem',textTransform:'uppercase',letterSpacing:'0.05em',color:'var(--muted)'}}>Active Agent Permission Envelope</h3>
                    <div style={{fontSize:'0.82rem',lineHeight:'2'}}>
                      <div style={{display:'flex',justifyContent:'space-between',borderBottom:'1px solid var(--border)',paddingBottom:'0.5rem',marginBottom:'0.5rem'}}><span style={{color:'var(--muted)'}}>Compiled from packs</span><span>security-baseline, pci-scope</span></div>
                      <div><span className="badge badge-red">5 blocked</span> &nbsp; iam_modify, secret_write, db_admin…</div>
                      <div style={{marginTop:'0.5rem'}}><span className="badge badge-amber">7 declare</span> &nbsp; s3_delete, s3_write, schema_modify…</div>
                      <div style={{marginTop:'0.5rem'}}><span className="badge badge-green">Session limit</span> &nbsp; max 15 files · max 2 abstractions</div>
                      <div style={{marginTop:'0.5rem'}}><span className="badge badge-orange">Track 1 active</span> &nbsp; SSE push to 3 open editors</div>
                    </div>
                  </div>
                </div>
              )}

              {persona === 'ciso' && (
                <div className="grid-2">
                  <div>
                    <h3 style={{fontSize:'1.4rem',marginBottom:'1rem'}}>AI agents are part of your attack surface. Time to govern them.</h3>
                    <p style={{color:'var(--muted)',fontSize:'0.95rem',marginBottom:'1.5rem'}}>VertaAI gives security teams the visibility, controls, and audit trail needed to govern AI coding agents under SOC 2, ISO 27001, and internal security policy.</p>
                    <ul style={{listStyle:'none',display:'flex',flexDirection:'column',gap:'0.75rem'}}>
                      {[
                        '5 critical capabilities blocked by default: iam_modify, secret_write, db_admin, infra_delete, deployment_modify',
                        'Runtime drift detected within minutes via CloudTrail (0.95 confidence) and GCP Audit Logs',
                        'Chain-of-custody: intent artifact → PR gate findings → runtime observations — full traceability',
                        'Track 1 closes the loop: production drift pushed back to the developer in real-time',
                        'PagerDuty for CRITICAL drift — effective severity gated by recency decay + source confidence',
                        'Human approval gate: schema_modify and HIGH capabilities require explicit sign-off before merge',
                      ].map(text => <li key={text} style={{display:'flex',gap:'0.75rem',fontSize:'0.9rem'}}><span style={{color:'var(--green)'}}>✓</span><span>{text}</span></li>)}
                    </ul>
                  </div>
                  <div className="card" style={{alignSelf:'start'}}>
                    <h3 style={{marginBottom:'1rem',fontSize:'0.9rem',textTransform:'uppercase',letterSpacing:'0.05em',color:'var(--muted)'}}>Severity Intelligence</h3>
                    <div style={{fontSize:'0.82rem',lineHeight:'2.2'}}>
                      {[['≤ 24h old','1.0×'],['1–5 days','0.7×'],['>5 days','0.3×']].map(([age,w]) => (
                        <div key={age} style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'var(--muted)'}}>{age}</span><span>Recency <strong>{w}</strong></span></div>
                      ))}
                      <div style={{borderTop:'1px solid var(--border)',marginTop:'0.5rem',paddingTop:'0.5rem'}}>
                        {[['CloudTrail / GCP','0.95'],['DB query logs','0.75']].map(([src,conf]) => (
                          <div key={src} style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'var(--muted)'}}>{src}</span><span>Confidence <strong>{conf}</strong></span></div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{marginTop:'5rem',textAlign:'center',padding:'3rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'16px'}}>
                <div className="label" style={{marginBottom:'1rem'}}>Early Access</div>
                <h2 style={{marginBottom:'1rem'}}>Ready to govern your AI coding agents?</h2>
                <p style={{color:'var(--muted)',fontSize:'1rem',marginBottom:'2rem'}}>VertaAI is in private early access. We&apos;re onboarding engineering teams deploying AI coding agents at scale who want real governance controls — not just usage dashboards.</p>
                <a href="mailto:hello@vertaai.io" className="btn-primary" style={{fontSize:'1rem',padding:'0.8rem 2rem'}}>Request Early Access →</a>
              </div>
            </div>
            <footer className="mkt-footer"><p>© 2026 VertaAI &nbsp;·&nbsp; <a href="mailto:hello@vertaai.io">hello@vertaai.io</a></p></footer>
          </>
        )}
      </div>
    </>
  );
}
