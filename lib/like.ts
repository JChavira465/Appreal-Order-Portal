// PostgREST passes `like`/`ilike` values straight through to SQL LIKE, so
// `%` and `_` in a value are wildcards, not literal characters. That's
// fine for a search box; it is not fine anywhere a matched row is then
// written to, because the value decides *which* row gets written.
//
// The customer order form is the case that forced this: the team name it
// matches on comes from an anonymous member of the public, and a match
// updates that customer's contact name, phone and shipping address. A
// team name of "%" matches the shop's first customer row and overwrites
// it. Escaping the wildcards makes an ilike behave the way every call
// site here already assumed it did -- a case-insensitive equality check.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
