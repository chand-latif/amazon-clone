"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { sendMagicLink, signInWithPassword } from "@/app/auth/actions";
import { AuthCard, FormError, FormNotice } from "./AuthCard";
import { Field } from "./Field";
import { SubmitButton } from "./SubmitButton";

type Mode = "password" | "link";

export function SignInForm({ next, initialError }: { next: string; initialError?: string }) {
  const [mode, setMode] = useState<Mode>("password");
  const [passwordState, passwordAction] = useActionState(signInWithPassword, null);
  const [linkState, linkAction] = useActionState(sendMagicLink, null);

  const state = mode === "password" ? passwordState : linkState;
  const signUpHref = next === "/" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard title="Sign in">
      <FormError message={state?.error ?? (state ? undefined : initialError)} />
      {mode === "link" && <FormNotice message={linkState?.message} />}

      <div role="tablist" aria-label="Sign-in method" className="mb-4 grid grid-cols-2 rounded bg-zinc-100 p-1 text-sm">
        {(
          [
            ["password", "Password"],
            ["link", "Email me a link"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tab-${value}`}
            aria-selected={mode === value}
            aria-controls={`panel-${value}`}
            onClick={() => setMode(value)}
            className={`rounded px-2 py-1.5 ${mode === value ? "bg-surface font-bold shadow-sm" : "text-zinc-600 hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <div id="panel-password" role="tabpanel" aria-labelledby="tab-password">
          <form action={passwordAction} className="space-y-4" noValidate>
            <input type="hidden" name="next" value={next} />
            <Field
              id="si-email"
              name="email"
              label="Email"
              type="email"
              autoComplete="username"
              defaultValue={passwordState?.values?.email}
              error={passwordState?.fieldErrors?.email}
              required
            />
            <Field
              id="si-password"
              name="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              error={passwordState?.fieldErrors?.password}
              required
            />
            <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
          </form>
        </div>
      ) : linkState?.message ? (
        <p className="text-sm text-zinc-600">
          Nothing arrived? Check your spam folder, or{" "}
          <button type="button" className="text-link underline" onClick={() => window.location.reload()}>
            try again
          </button>
          .
        </p>
      ) : (
        <div id="panel-link" role="tabpanel" aria-labelledby="tab-link">
          <form action={linkAction} className="space-y-4" noValidate>
            <input type="hidden" name="next" value={next} />
            <Field
              id="ml-email"
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              defaultValue={linkState?.values?.email}
              error={linkState?.fieldErrors?.email}
              hint="We'll email you a link that signs you in. No password needed."
              required
            />
            <SubmitButton pendingLabel="Sending…">Email me a sign-in link</SubmitButton>
          </form>
        </div>
      )}

      <p className="mt-6 border-t border-zinc-200 pt-4 text-center text-sm">
        New here?{" "}
        <Link href={signUpHref} className="text-link hover:text-price hover:underline">
          Create your account
        </Link>
      </p>
    </AuthCard>
  );
}
