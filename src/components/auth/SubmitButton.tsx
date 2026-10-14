"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingLabel = "Please wait…" }: { children: React.ReactNode; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-navy hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
