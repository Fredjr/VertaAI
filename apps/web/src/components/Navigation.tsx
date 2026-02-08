'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace') || 'demo-workspace';

  const navItems = [
    { href: `/onboarding?workspace=${workspaceId}`, label: '🚀 Setup', icon: '🚀' },
    { href: `/compliance?workspace=${workspaceId}`, label: '📋 Compliance', icon: '📋' },
    { href: `/coverage?workspace=${workspaceId}`, label: '📊 Coverage', icon: '📊' },
    { href: `/plans?workspace=${workspaceId}`, label: '📝 Plans', icon: '📝' },
    { href: `/settings?workspace=${workspaceId}`, label: '⚙️ Settings', icon: '⚙️' },
  ];

  const isActive = (href: string) => {
    const path = href.split('?')[0];
    return pathname === path;
  };

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                VertaAI
              </h1>
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center space-x-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-900 dark:text-primary-100'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Workspace Selector */}
          <div className="flex items-center">
            <div className="px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-sm">
              <span className="text-gray-600 dark:text-gray-400">Workspace:</span>{' '}
              <span className="font-medium text-gray-900 dark:text-white">{workspaceId}</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

