"use client";

import { useActionState, useEffect, useRef } from "react";
import { addAddress } from "@/app/checkout/actions";
import { FormError } from "@/components/auth/AuthCard";
import { Field } from "@/components/auth/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { COUNTRIES } from "@/lib/countries";

export function AddressForm({ onSaved, onCancel }: { onSaved: (addressId: string) => void; onCancel?: () => void }) {
  const [state, action] = useActionState(addAddress, null);

  // Tell the parent once per saved address (the state object is stable until the next submit).
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (state?.addressId && reported.current !== state.addressId) {
      reported.current = state.addressId;
      onSaved(state.addressId);
    }
  }, [state, onSaved]);

  const v = state?.values;
  const e = state?.fieldErrors;

  return (
    <form action={action} className="space-y-3 rounded border border-zinc-300 bg-zinc-50 p-4" noValidate>
      <h3 className="text-base font-bold">Add a new address</h3>
      <FormError message={state?.error} />

      <Field id="ad-name" name="fullName" label="Full name" autoComplete="name" defaultValue={v?.fullName} error={e?.fullName} maxLength={100} required />
      <Field id="ad-line1" name="line1" label="Street address" autoComplete="address-line1" defaultValue={v?.line1} error={e?.line1} maxLength={200} required />
      <Field id="ad-line2" name="line2" label="Apartment, suite, etc. (optional)" autoComplete="address-line2" defaultValue={v?.line2} error={e?.line2} maxLength={200} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="ad-city" name="city" label="City" autoComplete="address-level2" defaultValue={v?.city} error={e?.city} maxLength={100} required />
        <Field id="ad-region" name="region" label="State / Province / Region" autoComplete="address-level1" defaultValue={v?.region} error={e?.region} maxLength={100} required />
        <Field id="ad-postal" name="postalCode" label="Postal code" autoComplete="postal-code" defaultValue={v?.postalCode} error={e?.postalCode} maxLength={20} required />
        <div>
          <label htmlFor="ad-country" className="mb-1 block text-sm font-bold">
            Country
          </label>
          <select
            id="ad-country"
            name="country"
            autoComplete="country"
            defaultValue={v?.country || "US"}
            aria-invalid={e?.country ? true : undefined}
            aria-describedby={e?.country ? "ad-country-error" : undefined}
            className={`w-full rounded border bg-white px-3 py-2 text-sm ${e?.country ? "border-price" : "border-zinc-400"}`}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          {e?.country && (
            <p id="ad-country-error" className="mt-1 text-xs font-medium text-price">
              {e.country}
            </p>
          )}
        </div>
      </div>

      <Field id="ad-phone" name="phone" label="Phone (optional)" type="text" autoComplete="tel" defaultValue={v?.phone} error={e?.phone} maxLength={30} hint="For delivery questions only." />

      <div className="flex items-center gap-3 pt-1">
        <div className="w-44">
          <SubmitButton pendingLabel="Saving…">Save address</SubmitButton>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-link underline">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
