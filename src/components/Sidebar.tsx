'use client';
import { usePathname } from 'next/navigation';

const NAV = [
  { label: 'Dashboard', href: '/merchant' },
  { label: 'Invoices', href: '/invoices' },
  { label: 'Create Invoice', href: '/invoices/new' },
  { label: 'Customers', href: '/customers' },
  { label: 'Payments', href: '/payments' },
  { label: 'Checkout', href: '/checkout' },
  { label: 'Settings', href: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  // Determine the single active nav item by choosing the longest href that matches the current pathname
  const currentActiveHref = (() => {
    const hrefs = NAV.map(n => n.href);
    // Match exact or as a parent segment (href + '/')
    const candidates = hrefs.filter(h => pathname === h || pathname.startsWith(h + '/'));
    // Choose the longest match so children don't also light up the parent
    return candidates.sort((a, b) => b.length - a.length)[0] || pathname;
  })();

  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 bg-white/80 supports-[backdrop-filter]:backdrop-blur shadow-md sticky top-0 h-svh">
      <div className="flex flex-col w-full">
        {/* Brand bar */}
        <div className="h-14 px-4 flex items-center">
          <img src="/logo.png" className="h-7 w-auto" alt="logo" />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-1 overflow-auto">
          {NAV.map(({ label, href }) => {
            const active = href === currentActiveHref;
            return (
              <a
                key={href}
                href={href}
                className={[
                  'block rounded-lg px-3 py-2 text-sm transition',
                  active
                    // use core classes only so active never “disappears”
                    ? 'bg-black text-white'
                    : 'text-neutral-700 hover:bg-neutral-50'
                ].join(' ')}
              >
                <span className="align-middle">{label}</span>
              </a>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t text-xs text-neutral-500">
          © {new Date().getFullYear()} Aspire
        </div>
      </div>
    </aside>
  );
}