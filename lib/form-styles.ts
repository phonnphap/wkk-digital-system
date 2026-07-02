export function fieldCls(invalid: boolean, extra = '') {
  return `rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gold ${
    invalid ? 'border-red-400 bg-red-50' : 'border-sky-300 bg-white'
  } ${extra}`.trim();
}