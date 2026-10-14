/** Labelled input with an inline, screen-reader-linked error message. */
export function Field({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  defaultValue,
  error,
  hint,
  required = false,
  minLength,
  maxLength,
}: {
  id: string;
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded border px-3 py-2 text-sm ${error ? "border-price" : "border-zinc-400"} focus:border-accent`}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-zinc-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-price">
          {error}
        </p>
      )}
    </div>
  );
}
