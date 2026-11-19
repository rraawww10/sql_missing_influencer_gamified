// The Learn scroll: a little parchment that unrolls when you point at it (design/reader.css animates the parts).
export function ScrollArt({ size = 30 }: { size?: number }) {
  return (
    <svg className="scroll-art" width={size} height={size} viewBox="0 0 24 24" stroke="#231a4d" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" fill="none" aria-hidden="true" focusable="false">
      <g className="paper"><path d="M6 5h12v14H6z" fill="#fff6d6" /><path d="M9 9.6h6M9 12.6h6M9 15.6h3.5" /></g>
      <rect className="roll-t" x="3.5" y="3" width="17" height="4" rx="2" fill="#ffd43b" />
      <rect className="roll-b" x="3.5" y="17" width="17" height="4" rx="2" fill="#ffd43b" />
    </svg>
  );
}
