'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { ArrowLeft, ArrowRight, Save, X } from 'lucide-react';
import Link from 'next/link';

// Import form sections
import OverviewForm from './sections/OverviewForm';
import ScopeForm from './sections/ScopeForm';
import PackDefaultsForm from './sections/PackDefaultsForm';
import TrackAFormYAML from './sections/TrackAFormYAML';
import TrackBForm from './sections/TrackBForm';
import ApprovalTiersForm from './sections/ApprovalTiersForm';

interface PolicyPackFormData {
  // Overview
  name: string;
  description: string;
  owner?: string;
  packType?: 'GLOBAL_BASELINE' | 'SERVICE_OVERLAY';
  packMode?: 'observe' | 'warn' | 'enforce';
  strictness?: 'permissive' | 'balanced' | 'strict';
  status: 'DRAFT' | 'IN_REVIEW' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';
  defaultDecisionOnUnknown?: 'pass' | 'warn' | 'block';

  // Scope
  scopeType: 'workspace' | 'service' | 'repo';
  scopeRef: string;
  repoAllowlist: string[];
  reposInclude?: string[];
  reposExclude?: string[];
  branchesInclude?: string[];
  branchesExclude?: string[];
  pathGlobs: string[];
  scopePriority?: number;
  scopeMergeStrategy?: 'MOST_RESTRICTIVE' | 'HIGHEST_PRIORITY' | 'EXPLICIT';

  // Track A
  trackAEnabled: boolean;
  trackAConfig: any;
  trackAConfigYamlDraft?: string;
  workspaceId?: string;

  // Track B
  trackBEnabled: boolean;
  trackBConfig: any;

  // Approval Tiers
  approvalTiers: any;
  routing: any;
}

function NewPolicyPackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspaceId = searchParams.get('workspace') || 'demo-workspace';

  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<PolicyPackFormData>({
    name: '',
    description: '',
    owner: '',
    packType: 'SERVICE_OVERLAY',
    packMode: 'observe',
    strictness: 'balanced',
    status: 'DRAFT',
    defaultDecisionOnUnknown: 'warn',
    scopeType: 'workspace',
    scopeRef: '',
    repoAllowlist: [],
    reposInclude: [],
    reposExclude: [],
    branchesInclude: [],
    branchesExclude: [],
    pathGlobs: [],
    scopePriority: 50,
    scopeMergeStrategy: 'MOST_RESTRICTIVE',
    trackAEnabled: false,
    trackAConfig: {},
    trackAConfigYamlDraft: '',
    workspaceId: workspaceId,
    trackBEnabled: false,
    trackBConfig: {},
    approvalTiers: {},
    routing: {},
  });

  const steps = [
    { id: 1, name: 'Overview & Identity', component: OverviewForm },
    { id: 2, name: 'Scope Configuration', component: ScopeForm },
    { id: 3, name: 'Pack Defaults', component: PackDefaultsForm },
    { id: 4, name: 'Policy Authoring', component: TrackAFormYAML },
    { id: 5, name: 'Drift Remediation', component: TrackBForm },
    { id: 6, name: 'Approval & Routing', component: ApprovalTiersForm },
  ];

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

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/workspaces/${workspaceId}/policy-packs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create policy pack');
      }

      const data = await response.json();
      // API returns { policyPack: { id, ... } }
      router.push(`/policy-packs/${data.policyPack.id}?workspace=${workspaceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save policy pack');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/policy-packs?workspace=${workspaceId}`}
            className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Policy Packs
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Create New Policy Pack
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Configure unified policies for Contract Integrity Gate and Drift Remediation
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <nav aria-label="Progress">
            <ol className="flex items-center">
              {steps.map((step, stepIdx) => (
                <li key={step.id} className={`relative ${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20 flex-1' : ''}`}>
                  <div className="flex items-center">
                    <div className={`relative flex h-8 w-8 items-center justify-center rounded-full ${
                      currentStep > step.id
                        ? 'bg-blue-600'
                        : currentStep === step.id
                        ? 'border-2 border-blue-600 bg-white dark:bg-gray-800'
                        : 'border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                    }`}>
                      <span className={`text-sm font-medium ${
                        currentStep >= step.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {step.id}
                      </span>
                    </div>
                    <span className="ml-4 text-sm font-medium text-gray-900 dark:text-white">
                      {step.name}
                    </span>
                  </div>
                  {stepIdx !== steps.length - 1 && (
                    <div className="absolute top-4 left-8 -ml-px mt-0.5 h-0.5 w-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex">
              <X className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Form Content */}
        <div className="bg-white dark:bg-gray-800 shadow sm:rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          {CurrentStepComponent && (
            <CurrentStepComponent
              formData={formData}
              setFormData={setFormData}
            />
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className={`inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium ${
              currentStep === 1
                ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </button>

          <div className="flex gap-3">
            {currentStep < steps.length ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Policy Pack
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewPolicyPackPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewPolicyPackContent />
    </Suspense>
  );
}

