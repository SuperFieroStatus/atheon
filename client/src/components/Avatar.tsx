interface Props {
  first?: string;
  last?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}

export function Avatar({ first = '', last = '', color = '#636E72', size = 'md', title }: Props) {
  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase() || '?';
  const cls = size === 'lg' ? 'avatar lg' : size === 'sm' ? 'avatar sm' : 'avatar';
  return (
    <span className={cls} style={{ background: color }} title={title ?? `${first} ${last}`.trim()}>
      {initials}
    </span>
  );
}

interface Person { first_name: string; last_name: string; color: string }

/** Overlapping stack of avatars, with a "+N" chip when there are more than `max`. */
export function AvatarStack({ people, size = 'sm', max = 3 }: { people: Person[]; size?: 'sm' | 'md' | 'lg'; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const cls = size === 'lg' ? 'avatar lg' : size === 'sm' ? 'avatar sm' : 'avatar';
  return (
    <span className="avatar-stack">
      {shown.map((m, i) => (
        <Avatar key={i} first={m.first_name} last={m.last_name} color={m.color} size={size} />
      ))}
      {extra > 0 && (
        <span className={cls} style={{ background: 'var(--line-strong)', color: 'var(--text)' }} title={`${extra} more`}>
          +{extra}
        </span>
      )}
    </span>
  );
}
