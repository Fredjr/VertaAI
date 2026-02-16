'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import OverviewForm from '../new/sections/OverviewForm';
import TrackAForm from '../new/sections/TrackAForm';
import TrackBForm from '../new/sections/TrackBForm';
import ApprovalTiersForm from '../new/sections/ApprovalTiersForm';

interface PolicyPackFormData {
  name: string;
  description: string;
  status: 'active' | 'draft' | 'archived';
  scopeType: 'workspace' | 'service' | 'repo';
  scopeRef: string;
  repoAllowlist: string[];
  pathGlobs: string[];
  trackAEnabled: boolean;
  trackAConfig: any;
  trackBEnabled: boolean;
  trackBConfig: any;
  approvalTiers: any;
  routing: any;
}

export default function EditPolicyPackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    }>
      <EditPolicyPackContent />
    </Suspense>
  );
}

function EditPolicyPackContent() {
  const searchParams = useSearchParams();
  const params = useParams();
  const router = useRouter();
  const workspaceId = searchParams.get('workspace') || 'demo-workspace';
  const policyPackId = params.id as string;

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState<PolicyPackFormData>({
    name: '',
    description: '',
    status: 'draft',
    scopeType: 'workspace',
    scopeRef: '',
    repoAllowlist: [],
    pathGlobs: [],
    trackAEnabled: false,
    trackAConfig: {},
    trackBEnabled: false,
    trackBConfig: {},
    approvalTiers: {},
    routing: {},
  });

  const steps = [
    { id: 1, name: 'Overview', component: OverviewForm },
    { id: 2, name: 'Track A: Contract Integrity', component: TrackAForm },
    { id: 3, name: 'Track B: Drift Remediation', component: TrackBForm },
    { id: 4, name: 'Approval & Routing', component: ApprovalTiersForm },
  ];

  // Fetch existing policy pack data
  useEffect(() => {
    const fetchPolicyPack = async () => {
      try {
        setLoading(true);
        setError(null);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const response = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/policy-packs/${policyPackId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch policy pack');
        }

        const data = await response.json();
        const pack = data.policyPack;

        // Pre-populate form with existing data
        setFormData({
          name: pack.name || '',
          description: pack.description || '',
          status: pack.status || 'draft',
          scopeType: pack.scopeType || 'workspace',
          scopeRef: pack.scopeRef || '',
          repoAllowlist: pack.repoAllowlist || [],
          pathGlobs: pack.pathGlobs || [],
          trackAEnabled: pack.trackAEnabled || false,
          trackAConfig: typeof pack.trackAConfig === 'string' ? JSON.parse(pack.trackAConfig) : (pack.trackAConfig || {}),
          trackBEnabled: pack.trackBEnabled || false,
          trackBConfig: typeof pack.trackBConfig === 'string' ? JSON.parse(pack.trackBConfig) : (pack.trackBConfig || {}),
          approvalTiers: typeof pack.approvalTiers === 'string' ? JSON.parse(pack.approvalTiers) : (pack.approvalTiers || {}),
          routing: typeof pack.routing === 'string' ? JSON.parse(pack.routing) : (pack.routing || {}),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    if (workspaceId && policyPackId) {
      fetchPolicyPack();
    }
  }, [workspaceId, policyPackId]);

  const currentStepData = steps.find(s => s.id === currentStep);
  const CurrentStepComponent = currentStepData?.component;

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/policy-packs/${policyPackId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update policy pack');
      }

      const data = await response.json();
      setSuccessMessage('Policy pack updated successfully!');

      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading policy pack...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state (failed to load)
  if (error && !formData.name) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Failed to Load Policy Pack</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
            <Link
              href={`/policy-packs?workspace=${workspaceId}`}
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              ← Back to Policy Packs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/policy-packs?workspace=${workspaceId}`}
            className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Policy Packs
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Edit Policy Pack</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Update configuration for unified Track A and Track B policies
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-800 dark:text-green-200">{successMessage}</p>
          </div>
        )}

        {/* Error Message */}
        {error && formData.name && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                      currentStep === step.id
                        ? 'bg-blue-600 text-white'
                        : currentStep > step.id
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {step.id}
                  </div>
                  <div className="mt-2 text-xs text-center text-gray-600 dark:text-gray-400">
                    {step.name}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`h-1 flex-1 mx-2 ${
                      currentStep > step.id
                        ? 'bg-green-600'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          {CurrentStepComponent && (
            <CurrentStepComponent formData={formData} setFormData={setFormData} />
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

            {currentStep < steps.length && (
              <button
                onClick={handleNext}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

