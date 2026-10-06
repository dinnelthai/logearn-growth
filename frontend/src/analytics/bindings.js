/** Nullable booleans represent current verified account bindings, not historical bind clicks. */
export function bindingGroups(users) {
  return Object.fromEntries(['telegram_bound','email_bound'].map(field=>[field,{
    users:users.filter(u=>u[field]===true),
    unknown:users.filter(u=>typeof u[field]!=='boolean').length,
    known:users.filter(u=>typeof u[field]==='boolean').length,
  }]))
}
