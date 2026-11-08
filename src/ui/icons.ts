const paths={
  map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z"/><path d="M9 3v16M15 5v16"/>',
  controls:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h1m4 0h1m4 0h1M6 13h1m4 0h1m4 0h1M8 16h8"/>',
  camera:'<path d="M8 5 6 8H3v12h18V8h-3l-2-3Z"/><circle cx="12" cy="13" r="4"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  mirror:'<path d="M8 4h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3ZM5 14l-3 6M10 8l6 5"/>',
  reset:'<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
} as const;
export function icon(name:keyof typeof paths){return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;}
