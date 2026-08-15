import { supabase } from './supabase'
import { normalizePhone } from './phone'

/**
 * Whether some other customer already has this phone number.
 *
 * Asked of the server rather than of whatever customers a page happens to have
 * loaded: the Sales quick-add sees every customer, but a paged list does not,
 * and a duplicate that slipped through on page four would be just as wrong.
 *
 * Comparison is on digits alone, so "01712-345678" and "01712345678" count as
 * the same number - which is how the same person ends up on the list twice.
 *
 * `excludeId` is the customer being edited, who is allowed to keep their own
 * number.
 */
export async function phoneBelongsToAnotherCustomer(phone: string, excludeId?: string) {
  const digits = normalizePhone(phone)
  if (!digits) return false

  const { data, error } = await supabase
    .from('customers')
    .select('id, phone')

  // A failed lookup must not block saving a customer - the check is a guard
  // against a mistake, not a permission.
  if (error) return false

  return (data || []).some((customer: { id: string; phone?: string }) =>
    customer.id !== excludeId && normalizePhone(customer.phone || '') === digits)
}
