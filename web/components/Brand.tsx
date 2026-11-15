export function LogoTile({ size }: { size: number }) {
  return (
    <span className="logo-tile" style={{ width: size, height: size }}>
      <img src="/solsat-logo.svg" width={size} height={size} alt="" />
    </span>
  );
}

export function SolsatMark({ size, label }: { size: number; label?: string }) {
  return (
    <span className="solsat-mark">
      {label && <span className="by">{label}</span>}
      <LogoTile size={size} />
      <span className="brand-name">SOLSAT</span>
    </span>
  );
}
