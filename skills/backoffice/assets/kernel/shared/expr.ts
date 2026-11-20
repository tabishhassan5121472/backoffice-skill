// A tiny, safe expression language used by `compute`, rule `check`, and seed `calc` / `when`.
//
//   quantity * unit_price            arithmetic on fields of the same record
//   plan_id.price                    a field of a linked record
//   days(pickup_on, return_on)       whole days between two dates
//   return_on >= pickup_on           comparisons; also `and`, `or`, `not`
//   status == 'paid'                 text in single quotes
//   today, now                       the current date / date and time
//
// Functions: days(a, b), addDays(date, n), round(x, places), min(..), max(..), coalesce(..), if(cond, a, b).
// A missing value makes arithmetic and comparisons "unknown" (null) rather than an error.

export type Node =
  | { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; path: string[] }
  | { t: 'un'; op: string; a: Node } | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] };

export const FUNCTIONS = ['days', 'addDays', 'round', 'min', 'max', 'coalesce', 'if'];
const CONSTANTS = new Set(['today', 'now', 'true', 'false', 'null']);
const cache = new Map<string, Node>();

export function parseExpr(src: string): Node {
  const hit = cache.get(src);
  if (hit) return hit;
  const re = /\s*(?:(\d+(?:\.\d+)?)|'([^']*)'|"([^"]*)"|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)|(==|!=|<=|>=|[-+*/()<>,]))/y;
  const toks: { k: string; v: string }[] = [];
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new Error(`cannot read "${src.slice(pos).trim().slice(0, 12)}"`);
    pos = re.lastIndex;
    if (m[1] !== undefined) toks.push({ k: 'num', v: m[1] });
    else if (m[2] !== undefined || m[3] !== undefined) toks.push({ k: 'str', v: m[2] ?? m[3] });
    else if (m[4] !== undefined) toks.push({ k: 'id', v: m[4] });
    else toks.push({ k: 'op', v: m[5] });
  }
  let i = 0;
  const peek = (v?: string) => toks[i] && (v === undefined || (toks[i].v === v && toks[i].k !== 'str'));
  const take = (v: string) => { if (!peek(v)) throw new Error(`expected "${v}"`); i++; };
  const bin = (next: () => Node, ops: string[]) => () => {
    let a = next();
    while (toks[i] && toks[i].k !== 'str' && ops.includes(toks[i].v)) { const op = toks[i++].v; a = { t: 'bin', op, a, b: next() }; }
    return a;
  };
  const primary = (): Node => {
    const tk = toks[i++];
    if (!tk) throw new Error('ends too early');
    if (tk.k === 'num') return { t: 'num', v: Number(tk.v) };
    if (tk.k === 'str') return { t: 'str', v: tk.v };
    if (tk.k === 'op' && tk.v === '(') { const n = or(); take(')'); return n; }
    if (tk.k === 'id') {
      if (peek('(')) {
        if (!FUNCTIONS.includes(tk.v)) throw new Error(`unknown function "${tk.v}"`);
        i++;
        const args: Node[] = [];
        if (!peek(')')) do args.push(or()); while (peek(',') && ++i);
        take(')');
        return { t: 'call', fn: tk.v, args };
      }
      return { t: 'id', path: tk.v.split('.') };
    }
    throw new Error(`unexpected "${tk.v}"`);
  };
  const unary = (): Node => (peek('-') ? (i++, { t: 'un', op: '-', a: unary() }) : primary());
  const mul = bin(unary, ['*', '/']);
  const add = bin(mul, ['+', '-']);
  const cmp = bin(add, ['==', '!=', '<', '<=', '>', '>=']);
  const not = (): Node => (peek('not') ? (i++, { t: 'un', op: 'not', a: not() }) : cmp());
  const and = bin(not, ['and']);
  const or: () => Node = bin(and, ['or']);
  const node = or();
  if (i < toks.length) throw new Error(`unexpected "${toks[i].v}"`);
  cache.set(src, node);
  return node;
}

/** Every field path the expression reads, e.g. [['quantity'], ['plan_id', 'price']]. */
export function exprPaths(n: Node, out: string[][] = []): string[][] {
  if (n.t === 'id') { if (!(n.path.length === 1 && CONSTANTS.has(n.path[0]))) out.push(n.path); }
  else if (n.t === 'un') exprPaths(n.a, out);
  else if (n.t === 'bin') { exprPaths(n.a, out); exprPaths(n.b, out); }
  else if (n.t === 'call') n.args.forEach((a) => exprPaths(a, out));
  return out;
}

const day = (v: unknown) => String(v).slice(0, 10);
export const isoDay = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
export function addDays(v: unknown, n: number) {
  const s = String(v);
  const d = new Date(s.length <= 10 ? `${s}T00:00:00Z` : s);
  d.setUTCDate(d.getUTCDate() + Math.round(n));
  return s.length <= 10 ? d.toISOString().slice(0, 10) : d.toISOString();
}

export function evalExpr(src: string, lookup: (path: string[]) => unknown): any {
  const ev = (n: Node): any => {
    switch (n.t) {
      case 'num': case 'str': return n.v;
      case 'id': {
        if (n.path.length === 1) switch (n.path[0]) {
          case 'today': return isoDay();
          case 'now': return new Date().toISOString();
          case 'true': return true;
          case 'false': return false;
          case 'null': return null;
        }
        return lookup(n.path) ?? null;
      }
      case 'un': { const a = ev(n.a); if (a == null) return null; return n.op === '-' ? -a : !a; }
      case 'call': {
        if (n.fn === 'if') { const c = ev(n.args[0]); return c ? ev(n.args[1]) : ev(n.args[2]); }
        const a = n.args.map(ev);
        if (n.fn === 'coalesce') return a.find((x) => x != null) ?? null;
        if (a.some((x) => x == null)) return null;
        switch (n.fn) {
          case 'days': return Math.round((Date.parse(`${day(a[1])}T00:00:00Z`) - Date.parse(`${day(a[0])}T00:00:00Z`)) / 864e5);
          case 'addDays': return addDays(a[0], Number(a[1]));
          case 'round': { const p = 10 ** (a[1] ?? 0); return Math.round(Number(a[0]) * p) / p; }
          case 'min': return a.reduce((x, y) => (y < x ? y : x));
          case 'max': return a.reduce((x, y) => (y > x ? y : x));
        }
        return null;
      }
      case 'bin': {
        const a = ev(n.a);
        if (n.op === 'and') { if (a === false || a === 0) return false; const b = ev(n.b); return b === false || b === 0 ? false : a == null || b == null ? null : true; }
        if (n.op === 'or') { if (a != null && a !== false && a !== 0) return true; const b = ev(n.b); return b != null && b !== false && b !== 0 ? true : a == null || b == null ? null : false; }
        const b = ev(n.b);
        if (a == null || b == null) return n.op === '==' ? (a == null && b == null ? true : null) : null;
        switch (n.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return b === 0 ? null : a / b;
          // eslint-disable-next-line eqeqeq
          case '==': return a == b;
          // eslint-disable-next-line eqeqeq
          case '!=': return a != b;
          case '<': return a < b;
          case '<=': return a <= b;
          case '>': return a > b;
          case '>=': return a >= b;
        }
      }
    }
    return null;
  };
  const v = ev(parseExpr(src));
  return typeof v === 'number' && !Number.isFinite(v) ? null : v;
}
