export function Toggle({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-brand' : 'bg-ink-3/20'
        }`}
    >
      <span
        className={`absolute top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
          }`}
      />
    </button>
  );
}
