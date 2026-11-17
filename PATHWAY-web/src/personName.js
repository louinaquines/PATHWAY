// Display names as "LastName, FirstName" everywhere in the portal.
export default function personName(person) {
  if (!person) return '';
  const first = String(person.firstName || '').trim();
  const last = String(person.lastName || '').trim();
  return last && first ? `${last}, ${first}` : last || first;
}
