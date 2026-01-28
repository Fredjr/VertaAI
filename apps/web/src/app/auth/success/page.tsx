'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function AuthSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <AuthSuccessContent />
    </Suspense>
  );
}

function AuthSuccessContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');
  const orgId = searchParams.get('org');
  const service = searchParams.get('service') || 'Service';

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="bg-green-50 dark:bg-green-900/30 p-8 rounded-2xl border border-green-200 dark:border-green-800 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-green-800 dark:text-green-200 mb-2">
            Successfully Connected!
          </h1>
          <p className="text-green-700 dark:text-green-300 mb-6">
            {service} has been connected to your workspace.
          </p>
          {(workspaceId || orgId) && (
            <Link
              href={`/onboarding?workspace=${workspaceId || orgId}`}
              className="inline-block px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition"
            >
              Continue Setup
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

