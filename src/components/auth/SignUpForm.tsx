"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpWithPassword } from "@/app/auth/actions";
import { AuthCard, FormError, FormNotice } from "./AuthCard";
import { Field } from "./Field";
import { SubmitButton } from "./SubmitButton";

export function SignUpForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUpWithPassword, null);
  const signInHref = next === "/" ? "/signin" : `/signin?next=${encodeURIComponent(next)}`;

  if (state?.message) {
    return (
      <AuthCard title="Check your email">
        <FormNotice message={state.message} />
        <p className="text-sm text-zinc-600">
          Nothing arrived? Check your spam folder. Once you&apos;ve confirmed, you can{" "}
          <Link href={signInHref} className="text-link underline">
            sign in
          </Link>
          .
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create account">
      <FormError message={state?.error} />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <Field
          id="su-name"
          name="fullName"
          label="Your name (optional)"
          autoComplete="name"
          defaultValue={state?.values?.fullName}
          error={state?.fieldErrors?.fullName}
          maxLength={100}
        />
        <Field
          id="su-email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          defaultValue={state?.values?.email}
          error={state?.fieldErrors?.email}
          required
        />
        <Field
          id="su-password"
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          error={state?.fieldErrors?.password}
          hint="At least 8 characters."
          minLength={8}
          required
        />
        <SubmitButton pendingLabel="Creating account…">Create your account</SubmitButton>
      </form>

      <p className="mt-6 border-t border-zinc-200 pt-4 text-center text-sm">
        Already have an account?{" "}
        <Link href={signInHref} className="text-link hover:text-price hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
