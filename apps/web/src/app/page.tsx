'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to policy packs page with demo workspace
    router.push('/policy-packs?workspace=demo-workspace');
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500 mx-auto mb-8"></div>
        <p className="text-slate-400 text-lg">Loading VertaAI...</p>
      </div>
    </div>
  );
}
