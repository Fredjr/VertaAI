'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, GitPullRequest, Zap, Search, FileText, Terminal, Lock, 
  ArrowRight, CheckCircle2, AlertTriangle, Layers, Cpu, RefreshCw, 
  Menu, X, ChevronRight, Fingerprint, History, Eye, Activity, Globe, 
  Database, Code, Info, Share2, ClipboardCheck, Layout, Box, Gauge
} from 'lucide-react';

const App = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<any>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  // Content Data extracted from Product Guide
  const CONTENT = {
    drift: {
      api: {
        title: "API & Contract Drift",
        subtitle: "The Developer ↔ Customer Gap",
        problem: "OpenAPI spec says endpoint requires 'userId', but the docs say it's optional. Customers integrate against a lie.",
        solution: "VertaAI extracts 'Typed Deltas' from AST changes and compares them against Confluence/Notion specs deterministically.",
        impact: "Reduces integration support tickets by 60%."
      },
      ownership: {
        title: "Ownership & Routing Drift",
        subtitle: "The Incident Response Gap",
        problem: "CODEOWNERS says @platform-team, but the team was renamed 4 months ago. On-call routing fails during a P0.",
        solution: "VertaAI synchronizes team registries with metadata headers and service catalogs automatically.",
        impact: "Reduces Mean Time to Acknowledge (MTTA) by 15 mins."
      },
      infra: {
        title: "Infrastructure & Runbook Drift",
        subtitle: "The Reliability Gap",
        problem: "Terraform deploys to 3 regions. Your runbook only covers 2. Disaster Recovery fails when you need it most.",
        solution: "Deterministic matching between IaC resources and their corresponding operational instructions.",
        impact: "Ensures 100% Disaster Recovery readiness."
      },
      dash: {
        title: "Dashboard & Alert Drift",
        subtitle: "The Observability Gap",
        problem: "Metric name changed in code, but Grafana looks for the old key. You are flying blind.",
        solution: "Source-to-Dashboard tracing. We validate that every alert threshold matches the current code behavior.",
        impact: "Eliminates silent failures."
      }
    },
    tracks: {
      prevention: {
        title: "Track 1: Integrity Gate",
        badge: "PREVENTION",
        desc: "Fast, deterministic checks (< 30s) that run on every PR to block drift before it reaches production.",
        details: [
          "PR-Blocking GitHub Checks",
          "Inline Code Annotations",
          "Warn vs Block Enforcement Modes",
          "Zero LLM Latency for core checks"
        ]
      },
      remediation: {
        title: "Track 2: Truth Drift",
        badge: "REMEDIATION",
        desc: "Deep, event-driven scans that analyze accumulated debt and propose surgical, evidence-grounded patches.",
        details: [
          "Evidence-Grounded Patching",
          "Temporal Drift Accumulation",
          "Cluster-First Triage (80% noise reduction)",
          "Human-in-the-loop Approval"
        ]
      }
    }
  };

  const Modal = ({ data, onClose }: any) => (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-6 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-indigo-600/20 rounded-2xl flex items-center justify-center text-indigo-400">
              <Info size={24} />
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 transition-colors">
              <X size={20} />
            </button>
          </div>
          <h3 className="text-3xl font-bold text-white mb-2 tracking-tight">{data.title}</h3>
          <p className="text-indigo-400 text-sm font-bold uppercase tracking-widest mb-8">{data.subtitle || data.badge}</p>
          
          <div className="space-y-8">
            <div>
              <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-3">The Operational Risk</h4>
              <p className="text-slate-300 text-sm leading-relaxed">{data.problem || data.desc}</p>
            </div>
            {data.solution && (
              <div>
                <h4 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-3">VertaAI Enforcement</h4>
                <p className="text-slate-300 text-sm leading-relaxed">{data.solution}</p>
              </div>
            )}
            {data.details && (
              <div className="grid grid-cols-2 gap-4">
                {data.details.map((item: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="bg-slate-950 p-6 flex gap-3 border-t border-slate-800">
           <button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl text-sm transition-all" onClick={onClose}>
             Close Details
           </button>
           <button className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2">
             <Share2 size={16} /> Share Spec
           </button>
        </div>
      </div>
    </div>
  );

  const Navigation = () => (
    <nav className="fixed top-0 w-full z-[100] bg-slate-950/80 backdrop-blur-2xl border-b border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setCurrentPage('home')}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center transition-transform group-hover:rotate-3 shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <div>
              <span className="text-white font-black text-xl tracking-tight block leading-none">VertaAI</span>
              <span className="text-indigo-500 text-[9px] uppercase tracking-[0.3em] font-bold">Operational Truth</span>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-10">
            <button onClick={() => setCurrentPage('home')} className={`text-sm font-semibold transition-colors ${currentPage === 'home' ? 'text-indigo-400' : 'text-slate-400 hover:text-white'}`}>Platform</button>
            <button onClick={() => setCurrentPage('architecture')} className={`text-sm font-semibold transition-colors ${currentPage === 'architecture' ? 'text-indigo-400' : 'text-slate-400 hover:text-white'}`}>The Engine</button>
            <button onClick={() => setCurrentPage('compliance')} className={`text-sm font-semibold transition-colors ${currentPage === 'compliance' ? 'text-indigo-400' : 'text-slate-400 hover:text-white'}`}>Compliance</button>
            <button onClick={() => setCurrentPage('pricing')} className={`text-sm font-semibold transition-colors ${currentPage === 'pricing' ? 'text-indigo-400' : 'text-slate-400 hover:text-white'}`}>Pricing</button>
            <button className="bg-white hover:bg-slate-200 text-slate-950 px-6 py-2.5 rounded-full text-sm font-bold transition-all shadow-xl">
              Request PoV
            </button>
          </div>

          <div className="md:hidden">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-slate-300 p-2">
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden bg-slate-950 border-b border-slate-800 p-6 space-y-4 animate-in fade-in slide-in-from-top-4">
          <button onClick={() => {setCurrentPage('home'); setIsMenuOpen(false)}} className="block w-full text-left text-slate-300 py-3 border-b border-slate-900 font-medium">Platform</button>
          <button onClick={() => {setCurrentPage('architecture'); setIsMenuOpen(false)}} className="block w-full text-left text-slate-300 py-3 border-b border-slate-900 font-medium">Architecture</button>
          <button onClick={() => {setCurrentPage('compliance'); setIsMenuOpen(false)}} className="block w-full text-left text-slate-300 py-3 border-b border-slate-900 font-medium">Compliance</button>
          <button onClick={() => {setCurrentPage('pricing'); setIsMenuOpen(false)}} className="block w-full text-left text-slate-300 py-3 border-b border-slate-900 font-medium">Pricing</button>
          <button className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold mt-4">Book a Demo</button>
        </div>
      )}
    </nav>
  );

  const SectionHeading = ({ badge, title, subtitle }: any) => (
    <div className="text-center mb-16 px-4">
      <span className="inline-block px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-widest mb-6">
        {badge}
      </span>
      <h2 className="text-3xl md:text-6xl font-black mb-6 tracking-tighter text-white leading-none" dangerouslySetInnerHTML={{ __html: title }} />
      <p className="text-lg max-w-2xl mx-auto leading-relaxed text-slate-400 font-medium">{subtitle}</p>
    </div>
  );

  const HomePage = () => (
    <div className="bg-slate-950">
      {/* Hero */}
      <section className="relative px-4 pt-44 pb-32 overflow-hidden border-b border-slate-900">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[800px] bg-indigo-600/10 blur-[150px] rounded-full -z-10" />
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-6xl md:text-9xl font-black text-white mb-8 tracking-tighter leading-[0.9]">
            Operational Truth, <br /> <span className="text-indigo-500 italic">Enforced.</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed font-medium">
            Stop letting reality drift away from your contracts. VertaAI keeps code ↔ specs ↔ docs in sync, and blocks risky drift before it ships.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <button className="w-full sm:w-auto px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-bold text-xl shadow-2xl shadow-indigo-600/30 transition-all">
              Start Your Proof of Value
            </button>
            <button onClick={() => setCurrentPage('architecture')} className="w-full sm:w-auto px-10 py-5 bg-slate-900 hover:bg-slate-800 text-white rounded-full font-bold text-xl border border-slate-800 flex items-center justify-center gap-3 transition-all">
              The Engine <ArrowRight size={20} />
            </button>
          </div>

          <div className="mt-32 pt-16 border-t border-slate-900">
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-[0.3em] mb-12">The Operational Truth Stack</p>
            <div className="flex flex-wrap justify-center items-center gap-12 md:gap-20 opacity-30 grayscale contrast-125">
              <div className="flex items-center gap-2 text-white font-bold text-lg"><GitPullRequest size={20}/> GitHub</div>
              <div className="flex items-center gap-2 text-white font-bold text-lg"><Gauge size={20}/> Grafana</div>
              <div className="flex items-center gap-2 text-white font-bold text-lg"><FileText size={20}/> Confluence</div>
              <div className="flex items-center gap-2 text-white font-bold text-lg"><Activity size={20}/> PagerDuty</div>
              <div className="flex items-center gap-2 text-white font-bold text-lg"><Database size={20}/> Terraform</div>
            </div>
          </div>
        </div>
      </section>

      {/* The Loop of False Truth */}
      <section className="max-w-7xl mx-auto px-4 py-32">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          <div>
            <span className="text-red-500 text-xs font-bold uppercase tracking-widest mb-4 block">The Critical Failure</span>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-8 tracking-tighter leading-none">The Downward Spiral of False Operational Truth</h2>
            <p className="text-slate-400 text-lg mb-10 leading-relaxed font-medium">
              The real cost of drift isn't "stale documentation." It's that your team—and your customers—are making high-stakes decisions based on lies.
            </p>
            <div className="space-y-4">
              {[
                { label: "Reality Changes (Code/Infra)", status: "done" },
                { label: "Contracts Drift (Specs/SLOs)", status: "done" },
                { label: "Operational Knowledge Lies (Runbooks)", status: "fail" },
                { label: "People Act on Falsehoods (Incidents)", status: "critical" }
              ].map((step, i) => (
                <div key={i} className={`p-6 rounded-2xl flex items-center justify-between border ${step.status === 'critical' ? 'bg-red-500/10 border-red-500/50 text-red-500 font-bold scale-[1.03] shadow-lg shadow-red-500/20' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
                  <span className="text-sm font-bold">{i + 1}. {step.label}</span>
                  {step.status === 'critical' ? <AlertTriangle size={20} /> : <ArrowRight size={16} className="opacity-30" />}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            {Object.entries(CONTENT.drift).map(([key, item]) => (
              <button key={key} onClick={() => setActiveModal({ ...item, type: 'drift' })} className="bg-slate-900/50 p-8 rounded-3xl border border-slate-800 hover:border-indigo-500 transition-all text-left group active:scale-95">
                <div className="text-indigo-500 mb-6 group-hover:scale-110 transition-transform">
                  {key === 'api' && <Code size={32} />}
                  {key === 'ownership' && <Globe size={32} />}
                  {key === 'infra' && <Database size={32} />}
                  {key === 'dash' && <Activity size={32} />}
                </div>
                <h4 className="text-white font-bold mb-3 text-xl tracking-tight">{item.title}</h4>
                <p className="text-slate-500 text-xs leading-relaxed line-clamp-2">{item.problem}</p>
                <div className="mt-6 flex items-center gap-2 text-indigo-400 text-[10px] font-bold uppercase tracking-widest">Forensics <ArrowRight size={12}/></div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Dual Track Strategy */}
      <section className="max-w-7xl mx-auto px-4 py-32 bg-slate-900/30 rounded-[60px] border border-slate-900 mb-32 mx-4">
        <SectionHeading 
          badge="The Strategic Pivot"
          title="Consistency Enforcement Layer"
          subtitle="Total operational integrity through two complementary tracks."
        />
        <div className="grid md:grid-cols-2 gap-12 px-4 md:px-8">
          <div className="p-10 bg-slate-950 rounded-[40px] border border-slate-800 relative group overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity"><GitPullRequest size={120} /></div>
             <span className="text-indigo-500 text-[10px] font-black tracking-widest uppercase mb-4 block">Prevention</span>
             <h3 className="text-3xl font-black text-white mb-4 tracking-tighter">Track 1: Integrity Gate</h3>
             <p className="text-slate-400 text-sm mb-10 leading-relaxed font-medium">{CONTENT.tracks.prevention.desc}</p>
             <button onClick={() => setActiveModal(CONTENT.tracks.prevention)} className="bg-indigo-600 text-white px-8 py-3.5 rounded-full font-bold text-sm flex items-center gap-2 hover:bg-indigo-500 transition-all">
               Explore Prevention <ArrowRight size={18} />
             </button>
          </div>
          <div className="p-10 bg-slate-950 rounded-[40px] border border-slate-800 relative group overflow-hidden">
             <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity"><RefreshCw size={120} /></div>
             <span className="text-emerald-500 text-[10px] font-black tracking-widest uppercase mb-4 block">Remediation</span>
             <h3 className="text-3xl font-black text-white mb-4 tracking-tighter">Track 2: Truth Drift</h3>
             <p className="text-slate-400 text-sm mb-10 leading-relaxed font-medium">{CONTENT.tracks.remediation.desc}</p>
             <button onClick={() => setActiveModal(CONTENT.tracks.remediation)} className="bg-slate-800 text-white px-8 py-3.5 rounded-full font-bold text-sm flex items-center gap-2 hover:bg-slate-700 transition-all">
               Explore Remediation <ArrowRight size={18} />
             </button>
          </div>
        </div>
      </section>
    </div>
  );

  const ArchitecturePage = () => (
    <div className="pt-32 pb-24 bg-slate-950 min-h-screen px-4">
      <SectionHeading 
        badge="The Forensics Engine"
        title="Evidence-Grounded. <br /> Not LLM-Vibes."
        subtitle="We fetch up to 30K chars of surrounding system state before making any proposal. No hallucinations—only grounded truth."
      />

      <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8 mb-32">
        {[
          { icon: <Fingerprint />, title: "Typed Deltas", desc: "We convert code diffs into machine-readable objects: KeyValue, ToolMismatch, VersionDrift. Deterministic logic only." },
          { icon: <Activity />, title: "Bounded Context", desc: "VertaAI fetches up to 3 key files (configs, specs, Dockerfiles) to distinguish critical changes from trivial edits." },
          { icon: <History />, title: "Temporal Accumulation", desc: "Small drifts aren't noise; they're debt. We bundle small changes over 7 days into one high-value, material update." }
        ].map((item, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 p-8 rounded-3xl hover:border-indigo-500 transition-all group">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-8 group-hover:scale-110 transition-transform">{item.icon}</div>
            <h4 className="text-xl font-bold text-white mb-4 tracking-tight">{item.title}</h4>
            <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Managed Regions Callout */}
      <section className="max-w-5xl mx-auto bg-indigo-600 rounded-[50px] p-12 md:p-20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 blur-[100px] rounded-full" />
        <div className="grid lg:grid-cols-2 gap-16 items-center relative z-10">
          <div>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-8 tracking-tighter leading-none">Trust, Managed by <span className="underline decoration-white/30">Annotations.</span></h2>
            <p className="text-indigo-100 text-lg mb-10 font-medium leading-relaxed">
              Enterprises hate black-box automation. With **Managed Regions**, you designate safe zones for automated truth enforcement while keeping your strategic narrative human-only.
            </p>
            <div className="flex gap-4">
              <span className="bg-white/10 border border-white/20 px-4 py-2 rounded-xl text-white font-mono text-[10px] md:text-xs">DRIFT_AGENT_MANAGED</span>
            </div>
          </div>
          <div className="bg-slate-950 p-8 rounded-3xl border border-white/10 shadow-2xl font-mono text-[10px] md:text-xs text-slate-300">
            <p className="text-slate-500 italic"># Strategic section (Human only)</p>
            <p className="mb-4">Deciding when to deploy is a leadership decision...</p>
            <p className="text-indigo-500 font-bold">{"<!-- DRIFT_AGENT_MANAGED: ops_steps -->"}</p>
            <p className="text-slate-500">## Deployment Steps</p>
            <p className="text-emerald-400">+ 1. helm install api-service ./chart</p>
            <p className="text-emerald-400">+ 2. verify endpoint: /healthz</p>
            <p className="text-indigo-500 font-bold">{"<!-- END_DRIFT_AGENT_MANAGED -->"}</p>
          </div>
        </div>
      </section>
    </div>
  );

  const CompliancePage = () => (
    <div className="pt-32 pb-24 bg-slate-950 min-h-screen px-4">
      <SectionHeading 
        badge="Enterprise Compliance"
        title="The Liability Shield."
        subtitle="When an incident happens, 'I thought the doc was right' isn't an answer. VertaAI provides immutable proof of operational truth."
      />
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-20">
        <div className="space-y-16">
          <div className="p-8 bg-slate-900 rounded-3xl border border-slate-800">
            <h3 className="text-3xl font-black text-white mb-6 tracking-tighter">PlanRun Audit Trail</h3>
            <p className="text-slate-400 text-lg leading-relaxed mb-8">
              Every decision to skip, notify, or propose a patch is logged with an immutable PlanRun ID. We capture the exact version of the logic used at the millisecond of execution.
            </p>
            <div className="flex flex-wrap gap-4">
               {["SOC2 Audit Log", "ISO27001 Readiness", "GDPR Traceability"].map((tag, i) => (
                 <span key={i} className="px-3 py-1 bg-slate-950 rounded-lg text-indigo-400 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/20">{tag}</span>
               ))}
            </div>
          </div>
          <div className="p-8 bg-slate-900 rounded-3xl border border-slate-800">
            <h3 className="text-3xl font-black text-white mb-6 tracking-tighter">Optimistic Concurrency</h3>
            <p className="text-slate-400 text-lg leading-relaxed">
              Prevent documentation race conditions. We validate current page versions against fetch-time snapshots before any writeback, ensuring zero-loss updates.
            </p>
          </div>
        </div>
        <div className="bg-indigo-600 border border-indigo-500 rounded-[40px] p-10 flex flex-col justify-center shadow-2xl shadow-indigo-500/20">
          <Lock className="text-white mb-8" size={60} />
          <h4 className="text-white font-black text-4xl mb-8 tracking-tighter leading-none">The Security Checklist</h4>
          <div className="space-y-6">
            {["OAuth Scope Minimization", "Managed Regions (Data Isolation)", "Audit Trail Dashboard", "Multi-Tenant Isolation"].map((item, i) => (
              <div key={i} className="flex items-center gap-4 text-white font-bold text-xl">
                <CheckCircle2 size={24} /> {item}
              </div>
            ))}
          </div>
          <button className="mt-12 py-5 bg-slate-950 text-white rounded-2xl font-black text-lg hover:bg-slate-900 transition-all">Download Whitepaper</button>
        </div>
      </div>
    </div>
  );

  const PricingPage = () => (
    <div className="pt-32 pb-24 bg-slate-950 min-h-screen px-4">
      <SectionHeading 
        badge="Proof of Value"
        title="Zero-Risk Onboarding."
        subtitle="Start with a 14-day Proof of Value (PoV) and see exactly where your truth is drifting."
      />
      <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8">
        <div className="bg-slate-900/50 p-10 rounded-[40px] border border-slate-800 flex flex-col">
          <h3 className="text-white font-bold text-xl mb-2">Seed</h3>
          <p className="text-slate-500 text-xs mb-8 italic">For teams {"<"} 10 engineers</p>
          <div className="text-white font-black text-5xl mb-10 tracking-tight">$0 <span className="text-sm font-medium text-slate-500">/mo</span></div>
          <ul className="space-y-4 text-slate-400 text-sm mb-12 flex-1">
            <li className="flex items-center gap-3"><CheckCircle2 size={16} className="text-indigo-500" /> Up to 3 Repos</li>
            <li className="flex items-center gap-3"><CheckCircle2 size={16} className="text-indigo-500" /> Track 2 (Detection only)</li>
            <li className="flex items-center gap-3"><CheckCircle2 size={16} className="text-indigo-500" /> Community Slack</li>
          </ul>
          <button className="w-full py-4 bg-slate-800 text-white rounded-2xl font-bold hover:bg-slate-700 transition-all">Start Free</button>
        </div>

        <div className="bg-indigo-600 p-10 rounded-[40px] border border-indigo-500 flex flex-col relative md:scale-[1.05] shadow-2xl shadow-indigo-600/20">
          <div className="absolute top-0 right-0 p-4 bg-white text-indigo-600 text-[10px] font-black uppercase rounded-bl-2xl">Standard</div>
          <h3 className="text-white font-bold text-xl mb-2 text-indigo-50">Growth</h3>
          <p className="text-indigo-100 text-xs mb-8 italic">Scaling engineering orgs</p>
          <div className="text-white font-black text-5xl mb-10 tracking-tight">$499 <span className="text-sm font-medium text-indigo-200">/mo</span></div>
          <ul className="space-y-4 text-indigo-50 text-sm mb-12 flex-1">
            <li className="flex items-center gap-3"><CheckCircle2 size={16} className="text-white" /> Unlimited Repositories</li>
            <li className="flex items-center gap-3"><CheckCircle2 size={16} className="text-white" /> Track 1 (Warn Mode)</li>
            <li className="flex items-center gap-3"><CheckCircle2 size={16} className="text-white" /> Track 2 (Patch Proposals)</li>
            <li className="flex items-center gap-3"><CheckCircle2 size={16} className="text-white" /> 7-Day Temporal Bundle</li>
          </ul>
          <button className="w-full py-4 bg-white text-indigo-600 rounded-2xl font-black shadow-xl hover:bg-slate-100 transition-all">Start 14-Day PoV</button>
        </div>

        <div className="bg-slate-900/50 p-10 rounded-[40px] border border-slate-800 flex flex-col">
          <h3 className="text-white font-bold text-xl mb-2">Enterprise</h3>
          <p className="text-slate-500 text-xs mb-8 italic">Compliance & Risk Management</p>
          <div className="text-white font-black text-5xl mb-10 tracking-tight">Custom</div>
          <ul className="space-y-4 text-slate-400 text-sm mb-12 flex-1">
            <li className="flex items-center gap-3"><CheckCircle2 size={16} className="text-indigo-500" /> Track 1 (Block Merge Mode)</li>
            <li className="flex items-center gap-3"><CheckCircle2 size={16} className="text-indigo-500" /> Evidence Forensics Dashboard</li>
            <li className="flex items-center gap-3"><CheckCircle2 size={16} className="text-indigo-500" /> Dedicated Success Engineer</li>
          </ul>
          <button className="w-full py-4 bg-white text-slate-950 rounded-2xl font-black transition-all hover:bg-slate-200">Contact Sales</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-950 font-sans selection:bg-indigo-500 selection:text-white min-h-screen text-slate-300 antialiased">
      <Navigation />
      
      {activeModal && <Modal data={activeModal} onClose={() => setActiveModal(null)} />}

      <main>
        {currentPage === 'home' && <HomePage />}
        {currentPage === 'architecture' && <ArchitecturePage />}
        {currentPage === 'compliance' && <CompliancePage />}
        {currentPage === 'pricing' && <PricingPage />}
      </main>
      
      <footer className="bg-slate-950 border-t border-slate-900 py-24 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-16">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-indigo-500 w-8 h-8" />
              <span className="text-white font-black text-2xl tracking-tight">VertaAI</span>
            </div>
            <p className="text-slate-500 text-sm text-center md:text-left max-w-xs leading-relaxed">Enforcing operational truth for the world's most high-velocity engineering teams.</p>
          </div>
          <div className="grid grid-cols-2 gap-12 md:gap-24 text-sm text-slate-500 font-medium uppercase tracking-[0.2em] text-[10px]">
             <div className="space-y-4">
                <h4 className="text-white font-bold">Platform</h4>
                <p className="hover:text-white cursor-pointer" onClick={() => setCurrentPage('home')}>Prevention</p>
                <p className="hover:text-white cursor-pointer" onClick={() => setCurrentPage('architecture')}>Architecture</p>
             </div>
             <div className="space-y-4">
                <h4 className="text-white font-bold">Legal</h4>
                <p className="hover:text-white cursor-pointer" onClick={() => setCurrentPage('compliance')}>Security</p>
                <p className="hover:text-white cursor-pointer">Privacy</p>
             </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
