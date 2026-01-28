'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <AuthErrorContent />
    </Suspense>
  );
}

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const message = searchParams.get('message') || 'An unknown error occurred';

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="bg-red-50 dark:bg-red-900/30 p-8 rounded-2xl border border-red-200 dark:border-red-800 text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-red-800 dark:text-red-200 mb-2">
            Authentication Failed
          </h1>
          <p className="text-red-700 dark:text-red-300 mb-6">
            {decodeURIComponent(message)}
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
          >
            Return Home
          </Link>
        </div>
      </div>
    </main>
  );
}

