'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function GCPAuditSetupPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <GCPAuditSetupContent />
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

function GCPAuditSetupContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');
  
  const [step, setStep] = useState(1);
  const [setupMethod, setSetupMethod] = useState<'terraform' | 'manual' | null>(null);
  const [gcpProjectId, setGcpProjectId] = useState('');
  const [topicName, setTopicName] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; message: string } | null>(null);

  if (!workspaceId) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Error: No workspace ID provided</p>
          </div>
        </div>
      </main>
    );
  }

  const generateInfrastructure = async () => {
    if (!setupMethod) return;

    setIsGenerating(true);
    try {
      const response = await fetch(`${API_URL}/api/runtime/setup/terraform/gcp-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, gcpProjectId, topicName }),
      });

      const data = await response.json();
      
      if (data.success) {
        setGeneratedCode(data.terraformModule);
        setStep(3);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const testConnection = async () => {
    setIsTestingConnection(true);
    try {
      const response = await fetch(`${API_URL}/api/runtime/setup/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, source: 'gcp_audit_log' }),
      });

      const data = await response.json();
      setConnectionStatus(data);
    } catch (error: any) {
      setConnectionStatus({ connected: false, message: `Error: ${error.message}` });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const downloadCode = () => {
    const filename = 'vertaai-gcp-audit.tf';
    const blob = new Blob([generatedCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">🔍 GCP Audit Logs Setup</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Stream GCP Audit Logs to VertaAI for runtime capability tracking
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8 flex items-center justify-between">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                step >= s ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {s}
              </div>
              {s < 4 && <div className={`w-24 h-1 ${step > s ? 'bg-primary-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
          {step === 1 && (
            <SetupMethodSelector
              selectedMethod={setupMethod}
              onSelectMethod={(method) => {
                setSetupMethod(method);
                setStep(2);
              }}
            />
          )}

          {step === 2 && (
            <ConfigurationForm
              gcpProjectId={gcpProjectId}
              topicName={topicName}
              onGcpProjectIdChange={setGcpProjectId}
              onTopicNameChange={setTopicName}
              onGenerate={generateInfrastructure}
              isGenerating={isGenerating}
              setupMethod={setupMethod!}
            />
          )}

          {step === 3 && (
            <CodeDisplay
              code={generatedCode}
              setupMethod={setupMethod!}
              onDownload={downloadCode}
              onNext={() => setStep(4)}
            />
          )}

          {step === 4 && (
            <ConnectionTest
              onTest={testConnection}
              isTesting={isTestingConnection}
              status={connectionStatus}
              workspaceId={workspaceId}
            />
          )}
        </div>
      </div>
    </main>
  );
}

// Step 1: Setup Method Selector
interface SetupMethodSelectorProps {
  selectedMethod: 'terraform' | 'manual' | null;
  onSelectMethod: (method: 'terraform' | 'manual') => void;
}

function SetupMethodSelector({ selectedMethod, onSelectMethod }: SetupMethodSelectorProps) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Choose Setup Method</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Select how you'd like to deploy the GCP Audit Logs infrastructure
      </p>

      <div className="space-y-4">
        <MethodCard
          title="Terraform"
          description="Recommended for DevOps teams. Infrastructure as code with version control."
          icon="🏗️"
          recommended
          onClick={() => onSelectMethod('terraform')}
        />

        <MethodCard
          title="Manual Setup"
          description="Step-by-step guide for manual configuration in GCP Console."
          icon="📝"
          onClick={() => onSelectMethod('manual')}
        />
      </div>
    </div>
  );
}

interface MethodCardProps {
  title: string;
  description: string;
  icon: string;
  recommended?: boolean;
  onClick: () => void;
}

function MethodCard({ title, description, icon, recommended, onClick }: MethodCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950 transition text-left"
    >
      <div className="flex items-start gap-4">
        <span className="text-4xl">{icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-semibold">{title}</h3>
            {recommended && (
              <span className="px-2 py-1 bg-primary-100 text-primary-700 text-xs font-medium rounded">
                Recommended
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
        </div>
      </div>
    </button>
  );
}

// Step 2: Configuration Form
interface ConfigurationFormProps {
  gcpProjectId: string;
  topicName: string;
  onGcpProjectIdChange: (projectId: string) => void;
  onTopicNameChange: (name: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  setupMethod: 'terraform' | 'manual';
}

function ConfigurationForm({
  gcpProjectId,
  topicName,
  onGcpProjectIdChange,
  onTopicNameChange,
  onGenerate,
  isGenerating,
  setupMethod,
}: ConfigurationFormProps) {
  if (setupMethod === 'manual') {
    return <ManualSetupGuide />;
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Configure GCP Audit Logs</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Customize your GCP Audit Logs configuration
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">GCP Project ID</label>
          <input
            type="text"
            value={gcpProjectId}
            onChange={(e) => onGcpProjectIdChange(e.target.value)}
            placeholder="my-gcp-project"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Pub/Sub Topic Name <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={topicName}
            onChange={(e) => onTopicNameChange(e.target.value)}
            placeholder="Leave empty for auto-generated name"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          />
        </div>
      </div>

      <button
        onClick={onGenerate}
        disabled={isGenerating || !gcpProjectId}
        className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGenerating ? 'Generating...' : 'Generate Infrastructure Code'}
      </button>
    </div>
  );
}

// Step 3: Code Display
interface CodeDisplayProps {
  code: string;
  setupMethod: 'terraform' | 'manual';
  onDownload: () => void;
  onNext: () => void;
}

function CodeDisplay({ code, setupMethod, onDownload, onNext }: CodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Deploy Infrastructure</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Save this Terraform module and deploy it to your GCP project
      </p>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">vertaai-gcp-audit.tf</span>
          <div className="flex gap-2">
            <button
              onClick={copyToClipboard}
              className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button
              onClick={onDownload}
              className="px-3 py-1 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded"
            >
              Download
            </button>
          </div>
        </div>
        <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto max-h-96 text-sm">
          {code}
        </pre>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <h3 className="font-semibold mb-2">📋 Deployment Instructions</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Save the code to a file named <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">vertaai-gcp-audit.tf</code></li>
          <li>Run <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">terraform init</code></li>
          <li>Run <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">terraform plan</code> to review changes</li>
          <li>Run <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">terraform apply</code> to deploy</li>
        </ol>
      </div>

      <button
        onClick={onNext}
        className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
      >
        I've Deployed the Infrastructure →
      </button>
    </div>
  );
}

// Step 4: Connection Test
interface ConnectionTestProps {
  onTest: () => void;
  isTesting: boolean;
  status: { connected: boolean; message: string } | null;
  workspaceId: string;
}

function ConnectionTest({ onTest, isTesting, status, workspaceId }: ConnectionTestProps) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Test Connection</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Verify that VertaAI is receiving GCP Audit Logs from your project
      </p>

      <div className="mb-6">
        <button
          onClick={onTest}
          disabled={isTesting}
          className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTesting ? 'Testing Connection...' : 'Test Connection'}
        </button>
      </div>

      {status && (
        <div className={`p-4 rounded-lg border ${
          status.connected
            ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
            : 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800'
        }`}>
          <div className="flex items-start gap-3">
            <span className="text-2xl">{status.connected ? '✅' : '⏳'}</span>
            <div>
              <h3 className="font-semibold mb-1">
                {status.connected ? 'Connection Successful!' : 'No Events Received Yet'}
              </h3>
              <p className="text-sm text-gray-700 dark:text-gray-300">{status.message}</p>
              {!status.connected && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  It may take a few minutes for Audit Logs to start flowing. Try performing some GCP actions and test again.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {status?.connected && (
        <div className="mt-6">
          <a
            href={`/onboarding?workspace=${workspaceId}`}
            className="block w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-center"
          >
            Complete Setup →
          </a>
        </div>
      )}
    </div>
  );
}

// Manual Setup Guide
function ManualSetupGuide() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');
  const webhookUrl = `${API_URL}/api/runtime/gcp-audit`;

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Manual Setup Guide</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Follow these steps to manually configure GCP Audit Logs
      </p>

      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">📋 Prerequisites</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>GCP Project with billing enabled</li>
            <li>Owner or Editor role on the project</li>
            <li>Cloud Pub/Sub API enabled</li>
            <li>Cloud Logging API enabled</li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Step 1: Create Pub/Sub Topic</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Go to <a href="https://console.cloud.google.com/cloudpubsub" target="_blank" className="text-primary-600 hover:underline">GCP Pub/Sub Console</a></li>
            <li>Click "Create Topic"</li>
            <li>Name: <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">vertaai-audit-logs</code></li>
            <li>Click "Create"</li>
          </ol>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Step 2: Create Pub/Sub Subscription</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>In the topic details, click "Create Subscription"</li>
            <li>Subscription ID: <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">vertaai-audit-logs-sub</code></li>
            <li>Delivery type: <strong>Push</strong></li>
            <li>Endpoint URL: <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded break-all">{webhookUrl}</code></li>
            <li>Click "Create"</li>
          </ol>
        </div>

        <div>
          <h3 className="font-semibold mb-3">Step 3: Create Log Sink</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Go to <a href="https://console.cloud.google.com/logs/router" target="_blank" className="text-primary-600 hover:underline">GCP Logs Router</a></li>
            <li>Click "Create Sink"</li>
            <li>Sink name: <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">vertaai-audit-sink</code></li>
            <li>Sink destination: <strong>Cloud Pub/Sub topic</strong></li>
            <li>Select topic: <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">vertaai-audit-logs</code></li>
            <li>Filter: <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">logName:"cloudaudit.googleapis.com"</code></li>
            <li>Click "Create Sink"</li>
          </ol>
        </div>

        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">✅ Setup Complete!</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            GCP Audit Logs will now be streamed to VertaAI. Perform some GCP actions and test the connection.
          </p>
        </div>

        <a
          href={`/setup/gcp-audit?workspace=${workspaceId}&step=4`}
          className="block w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium text-center"
        >
          Test Connection →
        </a>
      </div>
    </div>
  );
}

