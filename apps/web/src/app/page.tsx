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
          --amber: #f59e0b; --amber2: #fcd34d;
          --green: #10b981; --red: #ef4444; --blue: #3b82f6; --purple: #a855f7;
        }
        body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
        .mkt { min-height: 100vh; }
        /* NAV */
        .mkt-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 2rem; height: 60px;
          background: rgba(10,12,15,0.92); backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .mkt-logo { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text); text-decoration: none; }
        .mkt-logo span { color: var(--accent2); }
        .mkt-nav-links { display: flex; gap: 0.25rem; list-style: none; }
        .mkt-nav-links button {
          display: block; padding: 0.4rem 0.75rem;
          font-size: 0.875rem; color: var(--muted); background: none; border: none;
          border-radius: 6px; cursor: pointer; transition: color 0.15s, background 0.15s;
        }
        .mkt-nav-links button:hover, .mkt-nav-links button.active { color: var(--text); background: var(--surface2); }
        .mkt-nav-cta {
          background: var(--accent); color: #fff; padding: 0.4rem 1.1rem;
          font-size: 0.875rem; font-weight: 600; border: none; border-radius: 7px;
          cursor: pointer; text-decoration: none; transition: background 0.15s;
          display: flex; align-items: center; gap: 0.5rem;
        }
        .mkt-nav-cta:hover { background: var(--accent2); }
        /* SECTIONS */
        .mkt-section { padding: 5rem 1.5rem; max-width: 1100px; margin: 0 auto; }
        h1 { font-size: clamp(2.2rem,5vw,3.6rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; }
        h2 { font-size: clamp(1.6rem,3vw,2.2rem); font-weight: 700; letter-spacing: -0.02em; }
        h3 { font-size: 1.1rem; font-weight: 600; }
        .label {
          display: inline-block; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--accent2); background: rgba(99,102,241,0.12);
          padding: 0.2rem 0.6rem; border-radius: 4px; margin-bottom: 1rem;
        }
        .gradient-text {
          background: linear-gradient(135deg,#818cf8 0%,#a78bfa 50%,#6ee7b7 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .muted { color: var(--muted); }
        .lead { font-size: 1.15rem; color: var(--muted); max-width: 640px; line-height: 1.7; }
        .grid-2 { display: grid; grid-template-columns: repeat(auto-fit,minmax(280px,1fr)); gap: 1.25rem; }
        .grid-3 { display: grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap: 1.25rem; }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
        .card:hover { border-color: var(--border2); }
        .card-icon { width: 40px; height: 40px; background: var(--surface2); border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; margin-bottom: 1rem; }
        /* TERMINAL */
        .terminal { background: #0d1117; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; font-family: 'SF Mono','Fira Code',monospace; font-size: 0.82rem; }
        .terminal-bar { display: flex; align-items: center; gap: 6px; padding: 0.6rem 1rem; background: var(--surface); border-bottom: 1px solid var(--border); }
        .terminal-dot { width: 11px; height: 11px; border-radius: 50%; }
        .terminal-body { padding: 1.25rem; line-height: 1.7; }
        .t-ok { color: var(--green); } .t-warn { color: var(--amber); } .t-block { color: var(--red); }
        .t-out { color: var(--muted); } .t-dim { color: #4a5568; }
        /* BADGES */
        .badge { display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.55rem; border-radius: 20px; }
        .badge-green { background: rgba(16,185,129,0.12); color: var(--green); }
        .badge-amber { background: rgba(245,158,11,0.12); color: var(--amber); }
        .badge-red   { background: rgba(239,68,68,0.12);  color: var(--red); }
        .badge-blue  { background: rgba(59,130,246,0.12); color: var(--blue); }
        .badge-purple{ background: rgba(168,85,247,0.12); color: var(--purple); }
        /* TRACK PILLS */
        .track-pill { display: inline-block; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; padding: 0.2rem 0.7rem; border-radius: 20px; }
        .track-0 { background: rgba(168,85,247,0.15); color: #c4b5fd; border: 1px solid rgba(168,85,247,0.3); }
        .track-a { background: rgba(99,102,241,0.15);  color: #a5b4fc; border: 1px solid rgba(99,102,241,0.3); }
        .track-b { background: rgba(16,185,129,0.15);  color: #6ee7b7; border: 1px solid rgba(16,185,129,0.3); }
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
        .stats-bar { display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-top: 4rem; }
        .stat { background: var(--surface); padding: 1.5rem; text-align: center; }
        .stat-num { font-size: 2rem; font-weight: 800; color: var(--accent2); letter-spacing: -0.04em; }
        .stat-label { font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem; }
        /* TRACK CARDS */
        .track-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 2rem; position: relative; overflow: hidden; }
        .track-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
        .track-card.t0::before { background: linear-gradient(90deg,#a855f7,#7c3aed); }
        .track-card.ta::before { background: linear-gradient(90deg,#6366f1,#4f46e5); }
        .track-card.tb::before { background: linear-gradient(90deg,#10b981,#059669); }
        .track-title { font-size: 1.1rem; font-weight: 700; margin: 0.75rem 0 0.5rem; }
        .track-desc  { font-size: 0.9rem; color: var(--muted); line-height: 1.6; }
        .track-bullets { list-style: none; margin-top: 1rem; }
        .track-bullets li { font-size: 0.85rem; color: var(--muted); padding: 0.2rem 0; display: flex; align-items: flex-start; gap: 0.5rem; }
        .track-bullets li::before { content: '→'; color: var(--accent2); flex-shrink: 0; }
        /* TIMELINE */
        .timeline-item { display: grid; grid-template-columns: 48px 1fr; gap: 1.25rem; margin-bottom: 2.5rem; }
        .timeline-number { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; font-weight: 800; flex-shrink: 0; }
        .tn-0 { background: rgba(168,85,247,0.2); color: #c4b5fd; }
        .tn-a { background: rgba(99,102,241,0.2); color: #a5b4fc; }
        .tn-b { background: rgba(16,185,129,0.2); color: #6ee7b7; }
        .timeline-content { padding-top: 0.6rem; }
        .timeline-content h3 { font-size: 1.1rem; margin-bottom: 0.35rem; }
        .timeline-content p  { color: var(--muted); font-size: 0.9rem; margin-bottom: 1rem; }
        /* PERM GRID */
        .perm-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(200px,1fr)); gap: 0.75rem; margin-top: 1.5rem; }
        .perm-card { background: var(--surface); border: 1px solid var(--border); border-radius: 9px; padding: 0.9rem 1rem; }
        .perm-cap { font-family: 'SF Mono',monospace; font-size: 0.78rem; color: var(--text); margin-bottom: 0.35rem; }
        /* INT GRID */
        .int-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(180px,1fr)); gap: 1rem; margin-top: 2rem; }
        .int-card { background: var(--surface); border: 1px solid var(--border); border-radius: 11px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }
        .int-icon { font-size: 1.8rem; } .int-name { font-weight: 600; font-size: 0.9rem; } .int-desc { font-size: 0.8rem; color: var(--muted); }
        /* AUDIT */
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
        @media (max-width: 640px) { .mkt-nav { padding: 0 1rem; } .mkt-nav-links { display: none; } .mkt-section { padding: 3rem 1rem; } }
        code { font-family: 'SF Mono','Fira Code',monospace; font-size: 0.75rem; color: var(--accent2); }
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

        {/* ── PLATFORM ── */}
        {section === 'platform' && (
          <>
            <div className="hero">
              <div className="hero-sub">
                <span className="label">AI Agent Governance</span>
                <span className="track-pill track-0">Track 0 · Pre-flight</span>
                <span className="track-pill track-a">Track A · PR Gate</span>
                <span className="track-pill track-b">Track B · Runtime</span>
              </div>
              <h1>Stop runaway AI agents<br /><span className="gradient-text">before they ship.</span></h1>
              <p className="lead hero-desc">VertaAI enforces your engineering policies at every stage of the AI coding workflow — before an agent writes code, at PR review, and in production. One platform. Five editors. Full audit trail.</p>
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
                {[['12','Capability types governed'],['5','AI coding editors supported'],['3','Enforcement layers'],['60s','Permission cache TTL']].map(([n,l]) => (
                  <div key={l} className="stat"><div className="stat-num">{n}</div><div className="stat-label">{l}</div></div>
                ))}
              </div>
            </div>

            <div className="mkt-section">
              <div className="label">The Problem</div>
              <h2>Your AI agents have no idea what your policies say.</h2>
              <p className="lead" style={{marginTop:'1rem',marginBottom:'3rem'}}>GitHub Copilot, Cursor, Claude Code, Windsurf — each one operates in isolation. They don't know your IAM policy, which services are off-limits, or your security runbook. When they write code that creates an S3 bucket, modifies a schema, or calls a cloud API, there's no gate stopping them.</p>
              <div className="grid-3">
                {[['🔑','Capability Sprawl','Agents request IAM roles, write secrets, and modify infrastructure without any pre-flight check against your policy.'],
                  ['🕵️','Zero Provenance','When an incident hits, you have no way to trace which AI agent wrote the code, under what context, or with what declared intent.'],
                  ['📊','Drift Blindness','What agents declare they need and what they actually call in production are two different things — and no one is watching the gap.']
                ].map(([icon,title,desc]) => (
                  <div key={title} className="card">
                    <div className="card-icon">{icon}</div>
                    <h3>{title}</h3>
                    <p style={{fontSize:'0.875rem',color:'var(--muted)',marginTop:'0.5rem'}}>{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mkt-section">
              <div className="label">The VertaAI Platform</div>
              <h2>Three tracks. One source of truth.</h2>
              <p className="lead" style={{marginTop:'1rem',marginBottom:'2.5rem'}}>VertaAI intercepts the AI coding workflow at three distinct moments — giving your team control without slowing developers down.</p>
              <div className="grid-3">
                <div className="track-card t0">
                  <span className="track-pill track-0">Track 0</span>
                  <div className="track-title">Pre-flight Permission Envelope</div>
                  <div className="track-desc">Before any code is written, the agent receives a permission envelope compiled from your active Policy Packs. Blocked capabilities are off the table from keystroke one.</div>
                  <ul className="track-bullets">
                    <li>Compiled from workspace Policy Packs</li>
                    <li>Injected into every editor&apos;s config files</li>
                    <li>5 blocked + 7 declaration-required capabilities</li>
                    <li>Session budgets (max files, max abstractions)</li>
                  </ul>
                </div>
                <div className="track-card ta">
                  <span className="track-pill track-a">Track A</span>
                  <div className="track-title">YAML Policy Gate at PR Review</div>
                  <div className="track-desc">At pull request time, VertaAI runs 5 automated comparators against the PR context, declared intent, and policy packs. Results post as a GitHub Check.</div>
                  <ul className="track-bullets">
                    <li>Intent ↔ capability parity check</li>
                    <li>Duplicate abstraction risk scoring</li>
                    <li>Churn + complexity threshold enforcement</li>
                    <li>Over-permissioned import detection</li>
                  </ul>
                </div>
                <div className="track-card tb">
                  <span className="track-pill track-b">Track B</span>
                  <div className="track-title">Runtime Drift Detection</div>
                  <div className="track-desc">In production, VertaAI continuously monitors CloudTrail, GCP Audit Logs, and DB query logs for capability usage that was never declared in the intent artifact.</div>
                  <ul className="track-bullets">
                    <li>AWS CloudTrail + GCP Audit Log ingestion</li>
                    <li>Decay-weighted severity scoring</li>
                    <li>PagerDuty + Slack alerting</li>
                    <li>Auto-close when drift resolves</li>
                  </ul>
                </div>
              </div>
            </div>
            <footer className="mkt-footer"><p>© 2026 VertaAI &nbsp;·&nbsp; <a href="mailto:hello@vertaai.io">hello@vertaai.io</a></p></footer>
          </>
        )}

        {/* ── HOW IT WORKS ── */}
        {section === 'howitworks' && (
          <>
            <div className="mkt-section">
              <div className="label">How It Works</div>
              <h2>From intent declaration to runtime audit — in three enforced steps.</h2>
              <p className="lead" style={{marginTop:'1rem',marginBottom:'3rem'}}>Every AI-generated code change flows through the VertaAI governance pipeline. Here&apos;s what happens at each stage.</p>

              <div className="timeline-item">
                <div className="timeline-number tn-0">0</div>
                <div className="timeline-content">
                  <span className="track-pill track-0" style={{marginBottom:'0.5rem',display:'inline-block'}}>Track 0 · Pre-flight</span>
                  <h3>Permission envelope compiled and injected</h3>
                  <p>Before a developer opens their editor, VertaAI compiles a permission envelope from all active Policy Packs. It&apos;s delivered to Claude Code (CLAUDE.md), Copilot (copilot-instructions.md), Cursor (.cursor/rules/vertaai-permissions.mdc), Windsurf (.windsurfrules), and Augment (.augment/settings.json) — automatically, on setup and every policy change.</p>
                  <div className="terminal">
                    <div className="terminal-bar">
                      <div className="terminal-dot" style={{background:'#ff5f57'}}></div>
                      <div className="terminal-dot" style={{background:'#febc2e'}}></div>
                      <div className="terminal-dot" style={{background:'#28c840'}}></div>
                      <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>.cursor/rules/vertaai-permissions.mdc</span>
                    </div>
                    <div className="terminal-body">
                      <div className="t-dim">---</div>
                      <div className="t-dim">alwaysApply: true</div>
                      <div className="t-dim">---</div>
                      <div className="t-block" style={{marginTop:'0.5rem'}}>🚫 BLOCKED: iam_modify · secret_write · db_admin · infra_delete · deployment_modify</div>
                      <div className="t-warn" style={{marginTop:'0.25rem'}}>⚠️ DECLARE BEFORE USE: s3_delete · s3_write · schema_modify · network_public · infra_create · infra_modify · secret_read</div>
                      <div className="t-ok" style={{marginTop:'0.25rem'}}>📋 SESSION BUDGETS: max 20 files changed · max 3 new abstractions</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="timeline-item">
                <div className="timeline-number tn-a">A</div>
                <div className="timeline-content">
                  <span className="track-pill track-a" style={{marginBottom:'0.5rem',display:'inline-block'}}>Track A · PR Gate</span>
                  <h3>YAML policy evaluated at pull request time</h3>
                  <p>When a PR is opened, VertaAI runs five comparators against the code changes, declared intent artifact, and active Policy Packs. Results post as a GitHub Check that can block merge.</p>
                  <div className="terminal">
                    <div className="terminal-bar">
                      <div className="terminal-dot" style={{background:'#ff5f57'}}></div>
                      <div className="terminal-dot" style={{background:'#febc2e'}}></div>
                      <div className="terminal-dot" style={{background:'#28c840'}}></div>
                      <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>GitHub Check · VertaAI Policy Gate</span>
                    </div>
                    <div className="terminal-body">
                      <div className="t-ok">✓ INTENT_CAPABILITY_PARITY &nbsp;&nbsp; Declared: [s3_write, schema_modify] · Undeclared: none</div>
                      <div className="t-ok">✓ CHURN_COMPLEXITY_RISK &nbsp;&nbsp;&nbsp;&nbsp; Lines: 847 · Threshold: 1200 · PASS</div>
                      <div className="t-warn">⚠ DUPLICATE_ABSTRACTION_RISK  Similarity: 0.78 with UserAuthService.ts · medium risk</div>
                      <div className="t-ok">✓ OVERPERMISSIONED_IMPORT &nbsp;&nbsp; ✓ INFRA_OWNERSHIP_PARITY</div>
                      <div className="t-ok" style={{marginTop:'0.5rem'}}>Result: PASS · Merge allowed</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="timeline-item">
                <div className="timeline-number tn-b">B</div>
                <div className="timeline-content">
                  <span className="track-pill track-b" style={{marginBottom:'0.5rem',display:'inline-block'}}>Track B · Runtime</span>
                  <h3>Continuous capability drift detection in production</h3>
                  <p>Post-deploy, VertaAI ingests AWS CloudTrail, GCP Audit Logs, and DB query logs. Undeclared capability usage surfaces as a DriftCluster with decay-weighted severity scoring.</p>
                  <div className="terminal">
                    <div className="terminal-bar">
                      <div className="terminal-dot" style={{background:'#ff5f57'}}></div>
                      <div className="terminal-dot" style={{background:'#febc2e'}}></div>
                      <div className="terminal-dot" style={{background:'#28c840'}}></div>
                      <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>Runtime drift monitor · user-service</span>
                    </div>
                    <div className="terminal-body">
                      <div className="t-block">🚨 DRIFT DETECTED · user-service · iam_modify</div>
                      <div className="t-out">Source: AWS CloudTrail (confidence: 0.95) · First seen: 3h ago · Occurrences: 47</div>
                      <div className="t-warn" style={{marginTop:'0.25rem'}}>Effective severity: CRITICAL (recency weight: 1.0 · confidence: 0.95)</div>
                      <div className="t-out" style={{marginTop:'0.25rem'}}>Remediation A: Remove IAM policy attachment · B: Restrict via permission boundary</div>
                      <div className="t-out">Correlation: iam_modify shared across [user-service, auth-service]</div>
                      <div className="t-out">PagerDuty: PD-291847 · Slack: #ai-governance</div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{marginTop:'4rem'}}>
                <div className="label">Provenance Debugging</div>
                <h2>Trace every line back to the agent that wrote it.</h2>
                <p className="lead" style={{marginTop:'1rem',marginBottom:'1.5rem'}}>VertaAI&apos;s CodeLens shows the AI author, PR number, and governance quality score inline. When an incident hits, you know exactly who (or what) wrote the code.</p>
                <div className="terminal">
                  <div className="terminal-bar">
                    <div className="terminal-dot" style={{background:'#ff5f57'}}></div>
                    <div className="terminal-dot" style={{background:'#febc2e'}}></div>
                    <div className="terminal-dot" style={{background:'#28c840'}}></div>
                    <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>userService.ts — CodeLens (VertaAI)</span>
                  </div>
                  <div className="terminal-body">
                    <div className="t-ok" style={{fontSize:'0.78rem'}}>🤖 agent · PR #142 | Quality: 84/100 &nbsp; [view governance report]</div>
                    <div className="t-out">export async function createUser(data: CreateUserInput) &#123;</div>
                    <div className="t-out">&nbsp; const user = await db.user.create(&#123; data &#125;);</div>
                    <div className="t-out">&nbsp; return user;</div>
                    <div className="t-out">&#125;</div>
                  </div>
                </div>
              </div>
            </div>
            <footer className="mkt-footer"><p>© 2026 VertaAI &nbsp;·&nbsp; <a href="mailto:hello@vertaai.io">hello@vertaai.io</a></p></footer>
          </>
        )}

        {/* ── INTEGRATIONS ── */}
        {section === 'integrations' && (
          <>
            <div className="mkt-section">
              <div className="label">Integrations</div>
              <h2>Every editor. Every cloud. Every alert channel.</h2>
              <p className="lead" style={{marginTop:'1rem',marginBottom:'2.5rem'}}>VertaAI meets your team where they work — injecting governance into the tools already open on your developers&apos; screens.</p>

              <h3 style={{color:'var(--muted)',textTransform:'uppercase',fontSize:'0.72rem',letterSpacing:'0.1em',marginBottom:'1rem'}}>AI Coding Editors</h3>
              <div className="int-grid">
                {[
                  ['🤖','Claude Code','.claude/CLAUDE.md · MCP tool for in-session governance queries'],
                  ['🐙','GitHub Copilot','.github/copilot-instructions.md with permission envelope auto-appended'],
                  ['⚡','Cursor','.cursor/rules/vertaai-permissions.mdc (alwaysApply: true) · CodeLens provenance'],
                  ['🌊','Windsurf','.windsurfrules project-level rules + MCP server for live queries'],
                  ['🔮','Augment','.augment/settings.json guidelines field + MCP transport'],
                ].map(([icon,name,desc]) => (
                  <div key={name} className="int-card">
                    <div className="int-icon">{icon}</div>
                    <div className="int-name">{name}</div>
                    <div className="int-desc">{desc}</div>
                  </div>
                ))}
              </div>

              <h3 style={{color:'var(--muted)',textTransform:'uppercase',fontSize:'0.72rem',letterSpacing:'0.1em',marginTop:'3rem',marginBottom:'1rem'}}>Runtime Observation Sources</h3>
              <div className="int-grid">
                {[
                  ['☁️','AWS CloudTrail','High-confidence event ingestion with cross-service correlation','0.95'],
                  ['🌐','GCP Audit Logs','insertId-based global deduplication','0.95'],
                  ['🗄️','Database Query Logs','1-hour time-bucket deduplication','0.75'],
                ].map(([icon,name,desc,conf]) => (
                  <div key={name} className="int-card">
                    <div className="int-icon">{icon}</div>
                    <div className="int-name">{name}</div>
                    <div className="int-desc">{desc}</div>
                    <span className={`badge ${parseFloat(conf as string) >= 0.9 ? 'badge-green' : 'badge-amber'}`}>Confidence: {conf}</span>
                  </div>
                ))}
              </div>

              <h3 style={{color:'var(--muted)',textTransform:'uppercase',fontSize:'0.72rem',letterSpacing:'0.1em',marginTop:'3rem',marginBottom:'1rem'}}>Alerting</h3>
              <div className="int-grid" style={{gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))'}}>
                {[
                  ['🔔','PagerDuty','Events API v2. CRITICAL drift creates incidents. Effective severity (decay + confidence) gates alert creation.'],
                  ['💬','Slack','Rich drift notifications with capability details, service, remediation links, and correlation signals.'],
                  ['🐙','GitHub Checks','Blocking check on every PR. Multi-pack evaluation with most-restrictive-wins conflict resolution.'],
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
                <h3>Available to all MCP-compatible agents</h3>
                <div className="terminal" style={{marginTop:'1rem'}}>
                  <div className="terminal-bar">
                    <div className="terminal-dot" style={{background:'#ff5f57'}}></div>
                    <div className="terminal-dot" style={{background:'#febc2e'}}></div>
                    <div className="terminal-dot" style={{background:'#28c840'}}></div>
                    <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>MCP tools exposed by VertaAI</span>
                  </div>
                  <div className="terminal-body">
                    <div className="t-ok">check_capability_intent</div>
                    <div className="t-out">&nbsp; → Pre-flight check: is this capability allowed under current policy?</div>
                    <div className="t-ok" style={{marginTop:'0.5rem'}}>get_governance_status</div>
                    <div className="t-out">&nbsp; → Full workspace markdown: active packs, blocked capabilities, session budgets, recent drift</div>
                    <div className="t-ok" style={{marginTop:'0.5rem'}}>report_capability_usage</div>
                    <div className="t-out">&nbsp; → Ingest a capability observation from within an agent session</div>
                  </div>
                </div>
              </div>
            </div>
            <footer className="mkt-footer"><p>© 2026 VertaAI &nbsp;·&nbsp; <a href="mailto:hello@vertaai.io">hello@vertaai.io</a></p></footer>
          </>
        )}

        {/* ── SECURITY ── */}
        {section === 'security' && (
          <>
            <div className="mkt-section">
              <div className="label">Security Model</div>
              <h2>A permission model built for the capabilities that matter.</h2>
              <p className="lead" style={{marginTop:'1rem',marginBottom:'2rem'}}>VertaAI&apos;s permission envelope is organized around 12 real cloud and infrastructure capability types — not vague categories. Every capability has a default enforcement level operators can tighten through Policy Packs.</p>

              <h3 style={{marginBottom:'1rem'}}>Blocked by Default (CRITICAL)</h3>
              <div className="perm-grid">
                {['iam_modify','secret_write','db_admin','infra_delete','deployment_modify'].map(c => (
                  <div key={c} className="perm-card"><div className="perm-cap">{c}</div><span className="badge badge-red">BLOCKED</span></div>
                ))}
              </div>

              <h3 style={{marginTop:'2.5rem',marginBottom:'1rem'}}>Require Declaration (HIGH)</h3>
              <div className="perm-grid">
                {['s3_delete','s3_write','schema_modify','network_public','infra_create','infra_modify','secret_read'].map(c => (
                  <div key={c} className="perm-card"><div className="perm-cap">{c}</div><span className="badge badge-amber">DECLARE</span></div>
                ))}
              </div>

              <div style={{marginTop:'3.5rem'}}>
                <div className="label">Policy Pack Overrides</div>
                <h3>Operators configure everything through the Policy Pack wizard.</h3>
                <p style={{color:'var(--muted)',fontSize:'0.9rem',marginTop:'0.5rem',marginBottom:'1.5rem'}}>The Agent Policy tab lets operators add blocked capabilities, require human approval for specific ones, and set session budgets — all via UI, no YAML hand-editing. Most-restrictive-wins across all active packs.</p>
                <div className="terminal">
                  <div className="terminal-bar">
                    <div className="terminal-dot" style={{background:'#ff5f57'}}></div>
                    <div className="terminal-dot" style={{background:'#febc2e'}}></div>
                    <div className="terminal-dot" style={{background:'#28c840'}}></div>
                    <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>Policy Pack YAML · security-baseline</span>
                  </div>
                  <div className="terminal-body">
                    <div className="t-dim">agentPolicy:</div>
                    <div className="t-dim">&nbsp; additionalBlocked: [s3_write, infra_create]</div>
                    <div className="t-dim">&nbsp; requireApproval: [schema_modify]</div>
                    <div className="t-dim">&nbsp; sessionBudgets:</div>
                    <div className="t-dim">&nbsp;&nbsp;&nbsp; maxFilesChanged: 15</div>
                    <div className="t-dim">&nbsp;&nbsp;&nbsp; maxNewAbstractions: 2</div>
                  </div>
                </div>
              </div>

              <div style={{marginTop:'3.5rem'}}>
                <div className="label">Chain of Custody</div>
                <h3>Complete audit trail from intent to production.</h3>
                <div style={{border:'1px solid var(--border)',borderRadius:'12px',overflow:'hidden',marginTop:'1.5rem'}}>
                  <div style={{background:'var(--surface)',padding:'0.75rem 1.25rem',borderBottom:'1px solid var(--border)',fontSize:'0.8rem',color:'var(--muted)',fontWeight:600}}>Audit Trail</div>
                  <div style={{padding:'0 1.25rem'}}>
                    {[
                      ['2026-03-05 14:05','INTENT','purple','IntentArtifact created — cursor/gpt-4o · declared: [s3_write, schema_modify]'],
                      ['2026-03-05 14:18','PR GATE','blue','Track A evaluation passed — 5/5 comparators · quality: 84/100'],
                      ['2026-03-05 14:31','MERGED','green','PR #142 merged · specBuildFindings stored · merge anchor recorded'],
                      ['2026-03-05 17:44','DRIFT','amber','iam_modify observed in production — not in declared capabilities'],
                      ['2026-03-05 17:44','ALERT','red','PagerDuty PD-291847 · Slack #ai-governance notified'],
                    ].map(([time,label,color,msg]) => (
                      <div key={time as string + label} className="audit-row">
                        <span className="audit-time">{time as string} UTC</span>
                        <span><span className={`badge badge-${color}`}>{label}</span> &nbsp;{msg as string}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <footer className="mkt-footer"><p>© 2026 VertaAI &nbsp;·&nbsp; <a href="mailto:hello@vertaai.io">hello@vertaai.io</a></p></footer>
          </>
        )}

        {/* ── SOLUTIONS ── */}
        {section === 'solutions' && (
          <>
            <div className="mkt-section">
              <div className="label">Solutions</div>
              <h2>Built for the teams responsible for what AI agents ship.</h2>
              <p className="lead" style={{marginTop:'1rem',marginBottom:'2.5rem'}}>Whether you&apos;re worried about code quality, security incidents, or audit readiness — VertaAI speaks your language.</p>

              <div className="persona-tabs">
                {([['tl','Tech Lead'],['em','Engineering Manager'],['ciso','CISO / Security']] as [Persona,string][]).map(([p,label]) => (
                  <button key={p} className={`persona-tab ${persona===p?'active':''}`} onClick={() => setPersona(p)}>{label}</button>
                ))}
              </div>

              {persona === 'tl' && (
                <div className="grid-2">
                  <div>
                    <h3 style={{fontSize:'1.4rem',marginBottom:'1rem'}}>You ship faster with AI. You also own the blast radius.</h3>
                    <p style={{color:'var(--muted)',fontSize:'0.95rem',marginBottom:'1.5rem'}}>VertaAI gives tech leads the control layer they&apos;ve been missing. Set capability budgets. Block the footguns. Get PR-level quality scores before code lands in main.</p>
                    <ul style={{listStyle:'none',display:'flex',flexDirection:'column',gap:'0.75rem'}}>
                      {['CodeLens shows which agent wrote each function — PR number, quality score, governance findings inline',
                        '5 automated Track A comparators run on every AI-authored PR',
                        'Session budgets prevent agents from sprawling across 50 files when the ticket called for 5',
                        'Duplicate abstraction detection catches N+1 AI-generated utility functions before they accumulate',
                      ].map(text => <li key={text} style={{display:'flex',gap:'0.75rem',fontSize:'0.9rem'}}><span style={{color:'var(--green)'}}>✓</span><span>{text}</span></li>)}
                    </ul>
                  </div>
                  <div className="terminal">
                    <div className="terminal-bar">
                      <div className="terminal-dot" style={{background:'#ff5f57'}}></div>
                      <div className="terminal-dot" style={{background:'#febc2e'}}></div>
                      <div className="terminal-dot" style={{background:'#28c840'}}></div>
                      <span style={{color:'var(--muted)',fontSize:'0.78rem',marginLeft:'0.5rem'}}>Weekly governance digest</span>
                    </div>
                    <div className="terminal-body">
                      <div className="t-ok">Team · AI Governance Week of Mar 3</div>
                      <div className="t-out" style={{marginTop:'0.5rem'}}>PRs evaluated: 34 &nbsp;·&nbsp; Pass rate: 91% (↑4%) &nbsp;·&nbsp; Avg quality: 79/100</div>
                      <div className="t-warn" style={{marginTop:'0.25rem'}}>Top findings: DUPLICATE_ABSTRACTION_RISK ×8 · INTENT_CAPABILITY_PARITY ×3</div>
                      <div className="t-ok" style={{marginTop:'0.25rem'}}>Runtime drift: 0 open clusters ✓</div>
                    </div>
                  </div>
                </div>
              )}

              {persona === 'em' && (
                <div className="grid-2">
                  <div>
                    <h3 style={{fontSize:'1.4rem',marginBottom:'1rem'}}>You&apos;re accountable for what your team&apos;s AI agents do at scale.</h3>
                    <p style={{color:'var(--muted)',fontSize:'0.95rem',marginBottom:'1.5rem'}}>VertaAI gives engineering managers workspace-level visibility and policy controls — without reading every PR personally.</p>
                    <ul style={{listStyle:'none',display:'flex',flexDirection:'column',gap:'0.75rem'}}>
                      {['Policy Packs let you define team-specific rules — churn limits, capability budgets, mandatory tests — in a UI',
                        'Active Agent Permission Envelope shows exactly what every AI agent is currently allowed to do',
                        'Exception waivers with expiry dates — temporary overrides with full audit trail',
                        'Works across your whole toolchain — no need to standardize on a single AI editor',
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
                    </div>
                  </div>
                </div>
              )}

              {persona === 'ciso' && (
                <div className="grid-2">
                  <div>
                    <h3 style={{fontSize:'1.4rem',marginBottom:'1rem'}}>AI agents are now part of your attack surface. Time to govern them.</h3>
                    <p style={{color:'var(--muted)',fontSize:'0.95rem',marginBottom:'1.5rem'}}>VertaAI gives security teams the visibility, controls, and audit trail needed to govern AI coding agents under SOC 2, ISO 27001, and internal security policy.</p>
                    <ul style={{listStyle:'none',display:'flex',flexDirection:'column',gap:'0.75rem'}}>
                      {['5 critical capabilities blocked by default — iam_modify, secret_write, db_admin, infra_delete, deployment_modify',
                        'Runtime drift detection identifies undeclared IAM, secrets, and infra usage in production within minutes',
                        'Chain-of-custody: every AI change linked intent artifact → PR gate → runtime observations',
                        'PagerDuty for CRITICAL drift — effective severity gated by source confidence and recency decay',
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
                <p style={{color:'var(--muted)',fontSize:'1rem',marginBottom:'2rem'}}>VertaAI is in private early access. We&apos;re onboarding engineering teams deploying AI coding agents who want real governance controls — not just usage dashboards.</p>
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
