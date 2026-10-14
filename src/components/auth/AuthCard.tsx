/** Centered card shared by the sign-in, sign-up and account pages. */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-sm py-6">
      <div className="rounded border border-zinc-300 bg-surface p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-medium">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  return (
    <div role="alert" aria-live="assertive" className={message ? "mb-4 rounded border border-price bg-red-50 p-3 text-sm text-price" : "sr-only"}>
      {message ?? ""}
    </div>
  );
}

export function FormNotice({ message }: { message?: string }) {
  return (
    <div role="status" aria-live="polite" className={message ? "mb-4 rounded border border-emerald-600 bg-emerald-50 p-3 text-sm text-emerald-900" : "sr-only"}>
      {message ?? ""}
    </div>
  );
}
