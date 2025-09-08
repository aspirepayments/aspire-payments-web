import './globals.css';
import type { Metadata } from 'next';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Aspire',
  description: 'Merchant portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen w-full bg-[#F7F9FC] text-[#0F172A]">
          <div className="flex">
            <Sidebar />
            <main className="flex-1 min-w-0">
              {/* Top bar with Sign out (staging) */}
              <div className="flex items-center justify-end px-4 md:px-6 py-3">
                <form action="/api/auth/staging/logout" method="post">
                  <button type="submit" className="btn btn-ghost">Sign out</button>
                </form>
              </div>

              <div className="p-4 md:p-6 lg:p-8 pt-0">
                {children}
              </div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}