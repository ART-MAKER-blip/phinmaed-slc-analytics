import Link from 'next/link';

export function AdminTabs({ current, canUsers, canReference }: { current: 'users' | 'reference'; canUsers: boolean; canReference: boolean }) {
  const tabs = [
    canUsers && { key: 'users', href: '/admin/users', label: 'Users and access' },
    canReference && { key: 'reference', href: '/admin/reference', label: 'Campuses, programs and terms' },
  ].filter(Boolean) as { key: string; href: string; label: string }[];
  return (
    <header className="flex flex-col gap-3">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Administration</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Changes here are recorded in the audit log. Zone rule sets are managed on the Zones page.</p>
      </div>
      <nav className="flex flex-wrap gap-1.5" aria-label="Administration sections">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} aria-current={current === t.key ? 'page' : undefined}
            className={`filter-pill ${current === t.key ? 'filter-pill-active' : ''}`}>{t.label}</Link>
        ))}
      </nav>
    </header>
  );
}

export const demoNotice = (
  <p className="rounded-md bg-zone-yellow-bg px-4 py-3 text-sm font-semibold text-zone-yellow-fg">
    Administration works on the database. Sign in with a database account.
  </p>
);
