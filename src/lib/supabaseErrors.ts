export function isMissingTableError(error: { code?: string; message?: string } | null | undefined, tableName: string) {
  if (!error) return false

  const message = (error.message || '').toLowerCase()
  return error.code === '42P01'
    || message.includes(`could not find the table 'public.${tableName}'`)
    || message.includes(`relation "public.${tableName}" does not exist`)
}
