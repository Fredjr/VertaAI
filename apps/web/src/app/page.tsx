export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-4xl mx-auto text-center">
        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
            VertaAI
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mt-2">
            Knowledge Drift Agent for Engineering Ops
          </p>
        </div>

        {/* Value Proposition */}
        <div className="mb-12 p-8 bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Keep your runbooks correct, automatically
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
            When code changes, documentation drifts. VertaAI detects when your 
            operational docs become stale and proposes PR-style diff patches—routed 
            to the right owner for one-click approval in Slack.
          </p>
        </div>

        {/* How it works */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="p-6 bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800">
            <div className="text-3xl mb-3">🔍</div>
            <h3 className="font-semibold text-lg mb-2">Detect Drift</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Monitors GitHub PRs for changes that affect your runbooks
            </p>
          </div>
          <div className="p-6 bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800">
            <div className="text-3xl mb-3">📝</div>
            <h3 className="font-semibold text-lg mb-2">Generate Patches</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Creates minimal, surgical diffs—never full rewrites
            </p>
          </div>
          <div className="p-6 bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800">
            <div className="text-3xl mb-3">✅</div>
            <h3 className="font-semibold text-lg mb-2">Approve in Slack</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              One-click approve, edit, or reject—right where you work
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-full text-sm">
          <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
          Coming soon — Pilot launching Q1 2026
        </div>
      </div>
    </main>
  );
}

