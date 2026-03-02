'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function CloudTrailSetupPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CloudTrailSetupContent />
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

function CloudTrailSetupContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');
  
  const [step, setStep] = useState(1);
  const [setupMethod, setSetupMethod] = useState<'terraform' | 'cloudformation' | 'manual' | null>(null);
  const [awsRegion, setAwsRegion] = useState('us-east-1');
  const [trailName, setTrailName] = useState('');
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
      const endpoint = setupMethod === 'terraform' 
        ? '/api/runtime/setup/terraform/cloudtrail'
        : '/api/runtime/setup/cloudformation/cloudtrail';

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, awsRegion, trailName }),
      });

      const data = await response.json();
      
      if (data.success) {
        setGeneratedCode(setupMethod === 'terraform' ? data.terraformModule : data.cloudFormationTemplate);
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
        body: JSON.stringify({ workspaceId, source: 'aws_cloudtrail' }),
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
    const filename = setupMethod === 'terraform' ? 'vertaai-cloudtrail.tf' : 'vertaai-cloudtrail.yaml';
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
          <h1 className="text-3xl font-bold mb-2">☁️ AWS CloudTrail Setup</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Stream AWS API calls to VertaAI for runtime capability tracking
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
              awsRegion={awsRegion}
              trailName={trailName}
              onAwsRegionChange={setAwsRegion}
              onTrailNameChange={setTrailName}
              onGenerate={generateInfrastructure}
              isGenerating={isGenerating}
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
  selectedMethod: 'terraform' | 'cloudformation' | 'manual' | null;
  onSelectMethod: (method: 'terraform' | 'cloudformation' | 'manual') => void;
}

function SetupMethodSelector({ selectedMethod, onSelectMethod }: SetupMethodSelectorProps) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Choose Setup Method</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Select how you'd like to deploy the CloudTrail infrastructure
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
          title="CloudFormation"
          description="Recommended for AWS-native teams. Deploy directly from AWS Console."
          icon="☁️"
          onClick={() => onSelectMethod('cloudformation')}
        />

        <MethodCard
          title="Manual Setup"
          description="Step-by-step guide for manual configuration in AWS Console."
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
  awsRegion: string;
  trailName: string;
  onAwsRegionChange: (region: string) => void;
  onTrailNameChange: (name: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

function ConfigurationForm({
  awsRegion,
  trailName,
  onAwsRegionChange,
  onTrailNameChange,
  onGenerate,
  isGenerating,
}: ConfigurationFormProps) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">Configure CloudTrail</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Customize your CloudTrail configuration
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">AWS Region</label>
          <select
            value={awsRegion}
            onChange={(e) => onAwsRegionChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          >
            <option value="us-east-1">US East (N. Virginia)</option>
            <option value="us-west-2">US West (Oregon)</option>
            <option value="eu-west-1">EU (Ireland)</option>
            <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Trail Name <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={trailName}
            onChange={(e) => onTrailNameChange(e.target.value)}
            placeholder="Leave empty for auto-generated name"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
          />
        </div>
      </div>

      <button
        onClick={onGenerate}
        disabled={isGenerating}
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
  setupMethod: 'terraform' | 'cloudformation' | 'manual';
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
        {setupMethod === 'terraform'
          ? 'Save this Terraform module and deploy it to your AWS account'
          : 'Save this CloudFormation template and deploy it to your AWS account'}
      </p>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            {setupMethod === 'terraform' ? 'vertaai-cloudtrail.tf' : 'vertaai-cloudtrail.yaml'}
          </span>
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
          {setupMethod === 'terraform' ? (
            <>
              <li>Save the code to a file named <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">vertaai-cloudtrail.tf</code></li>
              <li>Run <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">terraform init</code></li>
              <li>Run <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">terraform plan</code> to review changes</li>
              <li>Run <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">terraform apply</code> to deploy</li>
            </>
          ) : (
            <>
              <li>Save the template to a file named <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">vertaai-cloudtrail.yaml</code></li>
              <li>Go to AWS Console → CloudFormation → Create Stack</li>
              <li>Upload the template file</li>
              <li>Review and create the stack</li>
            </>
          )}
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
        Verify that VertaAI is receiving CloudTrail events from your AWS account
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
                  It may take a few minutes for CloudTrail events to start flowing. Try performing some AWS actions and test again.
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

