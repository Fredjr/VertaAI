/**
 * Layout for Contracts page
 * Forces dynamic rendering to support useSearchParams()
 */

export const dynamic = 'force-dynamic';

export default function ContractsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

