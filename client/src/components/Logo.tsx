export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="atheonG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ECA85A" />
          <stop offset="1" stopColor="#C97E3D" />
        </linearGradient>
      </defs>
      <path d="M32 6 L54 19 L54 45 L32 58 L10 45 L10 19 Z" fill="none" stroke="url(#atheonG)" strokeWidth="3" />
      <path d="M32 17 L44 24 L44 40 L32 47 L20 40 L20 24 Z" fill="none" stroke="#B7BCC2" strokeWidth="1.5" opacity="0.5" />
      <circle cx="32" cy="32" r="6.5" fill="url(#atheonG)" />
      <circle cx="32" cy="32" r="2.6" fill="#131518" />
    </svg>
  );
}

/** Low-profile horizontal wordmark used in the header. */
export function Logo() {
  return (
    <div className="logo" title="Atheon">
      <LogoMark size={26} />
      <span className="logo-word">ATHEON</span>
    </div>
  );
}
