/** Turns text a person typed into a regular expression that cannot break the query. */
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every word must match a name or the email, so "jane cruz" finds Jane Cruz.
 * Shared by the user and salary lists.
 */
export function searchFilter(search) {
  if (!search) return {};
  return {
    $and: search.split(/\s+/).map((word) => {
      const pattern = new RegExp(escapeRegex(word), 'i');
      return { $or: [{ firstName: pattern }, { lastName: pattern }, { email: pattern }] };
    }),
  };
}