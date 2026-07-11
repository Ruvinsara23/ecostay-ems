'use client';

// Shared form-field primitives (admin-console-v2 slice 01). One source of truth
// for the field look — previously duplicated across three admin views (AUDIT G).

export const fieldClass =
  'box-border w-full min-w-0 rounded-xl border border-hairline bg-white/70 px-3.5 py-2.5 font-normal text-ink outline-none transition focus:ring-2 focus:ring-brand';

export function TextField({
  label,
  type = 'text',
  value,
  placeholder,
  onChange,
}: {
  label: string;
  type?: 'text' | 'email' | 'password';
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
      />
    </label>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={fieldClass}
      />
    </label>
  );
}
