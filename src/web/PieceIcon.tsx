import type { PieceKind } from '../game/types.ts';
interface Props { kind: PieceKind | 'crown'; className?: string; x?: number; y?: number; size?: number }
export default function PieceIcon({ kind, className, x, y, size = 24 }: Props) {
  return <svg className={className} x={x} y={y} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
    {kind === 'soldier' && <circle cx="12" cy="12" r="6" />}
    {kind === 'rook' && <path d="M5 3h4v4h2V3h2v4h2V3h4v7l-3 2v6h3v3H5v-3h3v-6l-3-2Z" />}
    {kind === 'bishop' && <><path d="m12 2 2 3-4 5 2 1 4-4c4 5 0 9-2 10v1h4v3H6v-3h4v-1C4 14 5 8 12 2Z" /><circle cx="12" cy="2" r="1.5" /></>}
    {kind === 'knight' && <path d="m8 2 4 3c7 1 7 8 6 13h2v3H5v-3c1-5 7-6 7-10l-4 4-5-2 4-6Zm1 4-2 1 1 1 2-1Z" fillRule="evenodd" />}
    {(kind === 'queen' || kind === 'crown') && <><path d="m3 7 5 4 4-7 4 7 5-4-3 11H6Zm3 13h12v2H6Z" /><circle cx="3" cy="5" r="2" /><circle cx="12" cy="2" r="2" /><circle cx="21" cy="5" r="2" /></>}
  </svg>;
}
