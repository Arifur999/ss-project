/**
 * Plan prices to show when the settings request fails.
 *
 * The real figures are set by the super admin and fetched with getPaymentInfo();
 * these only stand in when that call cannot be made. They are kept in step with
 * the column defaults in hatim_Backend/prisma/schema/user.prisma, because a
 * stale number here is a price a customer reads and is then not charged.
 *
 * Both plan pages read from here so the two can never disagree.
 */
export const FALLBACK_PLAN_PRICES = {
  monthly: 599,
  yearly: 5780,
  yearlyOriginal: 7188,
} as const
