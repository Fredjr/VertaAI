'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface SetupStatus {
  workspace: { id: string; name: string; slug: string };
  integrations: {
    github: { connected: boolean; status: string; repos?: string[]; installationId?: number };
    confluence: { connected: boolean; status: string; siteName?: string; siteUrl?: string };
    slack: { connected: boolean; status: string; teamName?: string };
    notion: { connected: boolean; status: string; workspaceName?: string };
    pagerduty: { connected: boolean; status: string };
  };
  progress: { connected: number; required: number; percentage: number };
  stats: { signalEvents: number; driftCandidates: number; docMappings: number };
  webhookUrls: { github: string; pagerduty: string };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Wrapper component with Suspense for useSearchParams
export default function OnboardingPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <OnboardingContent />
    </Suspense>
  );
}

function LoadingSpinner() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
    </main>
  );
}

function OnboardingContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');
  
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setError('No workspace ID provided. Add ?workspace=YOUR_WORKSPACE_ID to the URL.');
      setLoading(false);
      return;
    }

    fetchStatus();
  }, [workspaceId]);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/setup-status`);
      if (!res.ok) throw new Error('Failed to fetch setup status');
      const data = await res.json();
      setStatus(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-6 rounded-xl max-w-md">
          <h2 className="font-semibold text-lg mb-2">Error</h2>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!status) return null;

  return (
    <main className="min-h-screen p-8 bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            🚀 Setup {status.workspace.name}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Connect your tools to start detecting knowledge drift
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8 p-6 bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium">Setup Progress</span>
            <span className="text-sm text-gray-500">{status.progress.connected}/{status.progress.required} integrations</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div 
              className="bg-primary-600 h-3 rounded-full transition-all duration-500"
              style={{ width: `${status.progress.percentage}%` }}
            ></div>
          </div>
        </div>

        {/* Integration Cards */}
        <div className="space-y-4 mb-8">
          {/* GitHub */}
          <IntegrationCard
            name="GitHub"
            icon="🔗"
            description="Monitor PRs for code changes that affect documentation"
            connected={status.integrations.github.connected}
            details={status.integrations.github.repos?.length ? `${status.integrations.github.repos.length} repos connected` : undefined}
            connectUrl={`${API_URL}/auth/github/install?workspaceId=${workspaceId}`}
            connectLabel="Install GitHub App"
          />

          {/* Confluence */}
          <IntegrationCard
            name="Confluence"
            icon="📄"
            description="Read and update your documentation pages"
            connected={status.integrations.confluence.connected}
            details={status.integrations.confluence.siteName}
            connectUrl={`${API_URL}/auth/confluence/install?workspaceId=${workspaceId}`}
            connectLabel="Connect Confluence"
          />

          {/* Slack */}
          <IntegrationCard
            name="Slack"
            icon="💬"
            description="Receive drift notifications and approve updates"
            connected={status.integrations.slack.connected}
            details={status.integrations.slack.teamName}
            connectUrl={`${API_URL}/auth/slack/install`}
            connectLabel="Add to Slack"
          />

          {/* Notion (optional) */}
          <IntegrationCard
            name="Notion"
            icon="📝"
            description="Alternative to Confluence for documentation"
            connected={status.integrations.notion.connected}
            details={status.integrations.notion.workspaceName}
            connectUrl={`${API_URL}/auth/notion/install?workspaceId=${workspaceId}`}
            connectLabel="Connect Notion"
            optional
          />
        </div>

        {/* Webhook URLs */}
        {status.integrations.github.connected && (
          <div className="mb-8 p-6 bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800">
            <h3 className="font-semibold text-lg mb-4">📡 Webhook Configuration</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Configure these webhook URLs in your GitHub repository settings to receive PR events.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  GitHub Webhook URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={status.webhookUrls.github}
                    className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-mono"
                  />
                  <button
                    onClick={() => copyToClipboard(status.webhookUrls.github, 'github')}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition"
                  >
                    {copied === 'github' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        {(status.stats.signalEvents > 0 || status.stats.driftCandidates > 0) && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard label="PR Events" value={status.stats.signalEvents} />
            <StatCard label="Drift Detected" value={status.stats.driftCandidates} />
            <StatCard label="Doc Mappings" value={status.stats.docMappings} />
          </div>
        )}

        {/* Next Steps */}
        <div className="p-6 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold text-lg mb-2 text-blue-800 dark:text-blue-200">
            📋 Next Steps
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-blue-700 dark:text-blue-300 text-sm">
            {!status.integrations.github.connected && (
              <li>Install the VertaAI GitHub App on your repositories</li>
            )}
            {!status.integrations.confluence.connected && !status.integrations.notion.connected && (
              <li>Connect Confluence or Notion to access your docs</li>
            )}
            {!status.integrations.slack.connected && (
              <li>Add VertaAI to Slack for notifications</li>
            )}
            {status.integrations.github.connected && status.webhookUrls && (
              <li>Copy the webhook URL above and add it to your GitHub repo settings</li>
            )}
            {status.progress.percentage === 100 && (
              <li>You&apos;re all set! Merge a PR to see drift detection in action.</li>
            )}
          </ol>
        </div>
      </div>
    </main>
  );
}

interface IntegrationCardProps {
  name: string;
  icon: string;
  description: string;
  connected: boolean;
  details?: string;
  connectUrl: string;
  connectLabel: string;
  optional?: boolean;
}

function IntegrationCard({ name, icon, description, connected, details, connectUrl, connectLabel, optional }: IntegrationCardProps) {
  return (
    <div className={`p-5 bg-white dark:bg-gray-900 rounded-xl shadow border ${connected ? 'border-green-300 dark:border-green-700' : 'border-gray-200 dark:border-gray-800'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-3xl">{icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{name}</h3>
              {optional && <span className="text-xs text-gray-400">(optional)</span>}
              {connected && <span className="text-green-600 text-sm">✓ Connected</span>}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
            {details && <p className="text-xs text-gray-500 mt-1">{details}</p>}
          </div>
        </div>
        {!connected && (
          <a
            href={connectUrl}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition"
          >
            {connectLabel}
          </a>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-4 bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800 text-center">
      <div className="text-2xl font-bold text-primary-600">{value}</div>
      <div className="text-sm text-gray-600 dark:text-gray-400">{label}</div>
    </div>
  );
}

