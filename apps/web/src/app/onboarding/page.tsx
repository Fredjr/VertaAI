'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
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

interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
  memberCount: number;
  isSelected: boolean;
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
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [savingChannel, setSavingChannel] = useState(false);

  const fetchStatus = useCallback(async () => {
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
  }, [workspaceId]);

  const fetchChannels = useCallback(async () => {
    if (!workspaceId) return;
    setChannelsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/slack/channels`);
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
        setSelectedChannelId(data.currentChannelId || null);
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    } finally {
      setChannelsLoading(false);
    }
  }, [workspaceId]);

  const handleChannelSelect = async (channelId: string) => {
    if (!workspaceId || savingChannel) return;
    setSavingChannel(true);
    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/slack/channels/default`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      if (res.ok) {
        setSelectedChannelId(channelId);
        setChannels(prev => prev.map(ch => ({ ...ch, isSelected: ch.id === channelId })));
      }
    } catch (err) {
      console.error('Failed to save channel:', err);
    } finally {
      setSavingChannel(false);
    }
  };

  useEffect(() => {
    if (!workspaceId) {
      setError('No workspace ID provided. Add ?workspace=YOUR_WORKSPACE_ID to the URL.');
      setLoading(false);
      return;
    }

    fetchStatus();
  }, [workspaceId, fetchStatus]);

  // Fetch Slack channels when Slack is connected
  useEffect(() => {
    if (status?.integrations.slack.connected) {
      fetchChannels();
    }
  }, [status?.integrations.slack.connected, fetchChannels]);

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
            connectUrl={`${API_URL}/auth/slack/install?workspaceId=${workspaceId}`}
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

          {/* PagerDuty (optional) */}
          <IntegrationCard
            name="PagerDuty"
            icon="📟"
            description="Detect process drift from incident patterns"
            connected={status.integrations.pagerduty.connected}
            details={status.integrations.pagerduty.connected ? 'Webhook configured' : undefined}
            connectUrl={`${API_URL}/auth/pagerduty/install?workspaceId=${workspaceId}`}
            connectLabel="Connect PagerDuty"
            optional
          />
        </div>

        {/* Active Workflows Summary - show when at least one integration is connected */}
        {(status.integrations.github.connected || status.integrations.pagerduty.connected) && (
          <ActiveWorkflowsSummary status={status} />
        )}

        {/* PagerDuty Webhook Configuration - show when PagerDuty is connected */}
        {status.integrations.pagerduty.connected && (
          <WebhookConfigSection
            title="PagerDuty Webhook"
            icon="📟"
            webhookUrl={status.webhookUrls.pagerduty}
            instructions="Configure this URL in PagerDuty: Service → Integrations → Add Integration → Generic Webhooks (v3). Select 'incident.resolved' events for best results."
          />
        )}

        {/* Slack Channel Selector - show when Slack is connected */}
        {status.integrations.slack.connected && (
          <div className="mb-8 p-6 bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800">
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <span>📢</span> Notification Channel
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Choose which Slack channel should receive drift notifications
            </p>
            {channelsLoading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary-600"></div>
                Loading channels...
              </div>
            ) : channels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {channels.filter(ch => ch.isMember).slice(0, 10).map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => handleChannelSelect(channel.id)}
                    disabled={savingChannel}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      selectedChannelId === channel.id
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    } ${savingChannel ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {channel.isPrivate ? '🔒' : '#'} {channel.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No channels found. Invite the VertaAI bot to a channel.</p>
            )}
          </div>
        )}

        {/* Doc Mapping Info - show when Confluence is connected */}
        {status.integrations.confluence.connected && (
          <div className="mb-8 p-6 bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800">
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <span>🗺️</span> Documentation Mapping
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              VertaAI uses smart search to find the right documentation for each PR.
              {status.stats.docMappings > 0
                ? ` You have ${status.stats.docMappings} doc mapping(s) configured.`
                : ' No explicit mappings needed - we\'ll search your Confluence automatically.'}
            </p>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>How it works:</strong> When a PR is merged, VertaAI searches your {status.integrations.confluence.siteName}
                for relevant docs using keywords from the PR. You&apos;ll see suggested docs in Slack and can approve the right one.
              </p>
            </div>
          </div>
        )}

        {/* All Connected Success Message */}
        {status.progress.percentage === 100 && (
          <div className="mb-8 p-6 bg-green-50 dark:bg-green-900/30 rounded-xl border border-green-200 dark:border-green-700">
            <h3 className="font-semibold text-lg mb-2 text-green-800 dark:text-green-200 flex items-center gap-2">
              <span>🎉</span> You&apos;re All Set!
            </h3>
            <p className="text-green-700 dark:text-green-300 text-sm">
              VertaAI is now connected to your GitHub, Slack, and documentation system.
              When you merge a PR that requires documentation updates, you&apos;ll receive a notification in Slack with a suggested patch.
            </p>
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

        {/* Next Steps - only show if not all connected */}
        {status.progress.percentage < 100 && (
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
            </ol>
          </div>
        )}
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

/**
 * Active Workflows Summary
 * Shows which drift detection workflows are active based on connected integrations
 */
function ActiveWorkflowsSummary({ status }: { status: SetupStatus }) {
  const workflows: Array<{ icon: string; source: string; targets: string; driftTypes: string; enabled: boolean }> = [];

  // GitHub PR workflows
  if (status.integrations.github.connected) {
    if (status.integrations.confluence.connected || status.integrations.notion.connected) {
      const docTarget = status.integrations.confluence.connected && status.integrations.notion.connected
        ? 'Confluence & Notion'
        : status.integrations.confluence.connected ? 'Confluence' : 'Notion';
      workflows.push({
        icon: '🔗',
        source: 'GitHub PR',
        targets: docTarget,
        driftTypes: 'instruction, process drift',
        enabled: true,
      });
    }
    // README/Swagger always available with GitHub
    workflows.push({
      icon: '📄',
      source: 'GitHub PR',
      targets: 'README.md & Swagger',
      driftTypes: 'developer docs',
      enabled: true,
    });
  }

  // PagerDuty workflows
  if (status.integrations.pagerduty.connected) {
    const docTarget = status.integrations.confluence.connected ? 'Confluence' :
                      status.integrations.notion.connected ? 'Notion' : 'docs';
    workflows.push({
      icon: '📟',
      source: 'PagerDuty Incident',
      targets: docTarget,
      driftTypes: 'process, ownership drift',
      enabled: status.integrations.confluence.connected || status.integrations.notion.connected,
    });
  }

  // Slack Question workflows (always available if Slack connected)
  if (status.integrations.slack.connected && (status.integrations.confluence.connected || status.integrations.notion.connected)) {
    const docTarget = status.integrations.confluence.connected ? 'Confluence' : 'Notion';
    workflows.push({
      icon: '💬',
      source: 'Slack Questions',
      targets: docTarget,
      driftTypes: 'coverage gaps',
      enabled: true,
    });
  }

  // Phase 5: IaC changes (Terraform/Pulumi) - detected from GitHub PRs
  if (status.integrations.github.connected) {
    workflows.push({
      icon: '🏗️',
      source: 'Terraform/Pulumi Changes',
      targets: 'README.md & Confluence',
      driftTypes: 'environment drift',
      enabled: status.integrations.confluence.connected || status.integrations.notion.connected,
    });
  }

  // Phase 5: Datadog/Grafana alerts (placeholder - shows what's possible)
  workflows.push({
    icon: '📊',
    source: 'Datadog/Grafana Alerts',
    targets: 'README & Runbooks',
    driftTypes: 'environment drift',
    enabled: false,
  });

  if (workflows.length === 0) {
    return null;
  }

  return (
    <div className="mb-8 p-6 bg-gradient-to-br from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-xl border border-primary-200 dark:border-primary-800">
      <h3 className="font-semibold text-lg mb-3 flex items-center gap-2 text-primary-800 dark:text-primary-200">
        <span>⚡</span> Active Workflows
      </h3>
      <p className="text-sm text-primary-700 dark:text-primary-300 mb-4">
        Based on your connected integrations, VertaAI will automatically detect these drift types:
      </p>
      <div className="space-y-2">
        {workflows.map((workflow, index) => (
          <div
            key={index}
            className={`flex items-center gap-3 p-3 rounded-lg ${
              workflow.enabled
                ? 'bg-white/70 dark:bg-gray-900/50'
                : 'bg-gray-100/50 dark:bg-gray-800/30 opacity-60'
            }`}
          >
            <span className="text-xl">{workflow.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                  {workflow.source}
                </span>
                <span className="text-gray-400">→</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {workflow.targets}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {workflow.driftTypes}
              </div>
            </div>
            {workflow.enabled ? (
              <span className="text-green-600 text-sm">✓ Active</span>
            ) : (
              <span className="text-gray-400 text-xs">Connect to enable</span>
            )}
          </div>
        ))}
      </div>
      {/* Link to Settings page */}
      <div className="mt-4 pt-4 border-t border-primary-200 dark:border-primary-800">
        <a
          href={`/settings?workspace=${status.workspace.id}`}
          className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 flex items-center gap-1"
        >
          ⚙️ Customize workflow settings →
        </a>
      </div>
    </div>
  );
}

/**
 * Webhook Configuration Section
 * Displays webhook URL with copy functionality
 */
function WebhookConfigSection({
  title,
  icon,
  webhookUrl,
  instructions,
}: {
  title: string;
  icon: string;
  webhookUrl: string;
  instructions: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="mb-8 p-6 bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-800">
      <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {instructions}
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-mono text-gray-800 dark:text-gray-200 overflow-x-auto">
          {webhookUrl}
        </code>
        <button
          onClick={handleCopy}
          className={`px-4 py-3 rounded-lg text-sm font-medium transition ${
            copied
              ? 'bg-green-600 text-white'
              : 'bg-primary-600 hover:bg-primary-700 text-white'
          }`}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
