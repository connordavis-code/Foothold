/**
 * Layout for unauthenticated pages: /login, /verify, /error.
 * Just centers content on the page.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
