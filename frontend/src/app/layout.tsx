import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeadFlow — Multi-Tenant AI Lead Qualification & CRM",
  description: "B2B Lead Qualification and CRM Synchronization Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                LF
              </div>
              <div>
                <span className="font-bold text-lg text-slate-900">LeadFlow</span>
                <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                  v1.0.0
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm font-medium text-slate-800">Acme Technologies</div>
                <div className="text-xs text-slate-500">Tenant: org_demo_01</div>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-semibold text-slate-700 text-sm">
                AT
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
