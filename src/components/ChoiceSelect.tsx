import { defaultOptionLabel } from "../lib/checkSettings.js";

/**
 * The one control for a setting a repository may leave to its account: use the account's setting
 * (with what that resolves to), on, or off. Where `blockedReason` is given it is read-only and says
 * why on hover.
 */
export default function ChoiceSelect({
  value,
  onChange,
  label,
  resolved,
  isOrg,
  blockedReason,
}: {
  value: string;
  onChange: (next: string) => void;
  /** What the control is for, read aloud. */
  label: string;
  /** What the account's setting resolves to, shown in the first option. */
  resolved: boolean;
  isOrg: boolean;
  blockedReason?: string | null;
}) {
  return (
    <select
      className="choice-select"
      aria-label={label}
      value={value}
      disabled={!!blockedReason}
      title={blockedReason || undefined}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="default">{defaultOptionLabel(isOrg, resolved)}</option>
      <option value="on">On</option>
      <option value="off">Off</option>
    </select>
  );
}
