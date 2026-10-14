"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/auth/actions";
import { FormError, FormNotice } from "./AuthCard";
import { Field } from "./Field";
import { SubmitButton } from "./SubmitButton";

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, action] = useActionState(updateProfile, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state?.error} />
      <FormNotice message={state?.message} />
      <Field
        id="pf-name"
        name="fullName"
        label="Your name"
        autoComplete="name"
        defaultValue={state?.values?.fullName ?? fullName}
        error={state?.fieldErrors?.fullName}
        maxLength={100}
      />
      <div className="w-40">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}
