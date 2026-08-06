// Shared plumbing for the CSV importers.
//
// Rows are written in batches rather than one big insert. That is what lets the
// progress dialog show a real number instead of jumping from 0% to 100%, and it
// keeps a large file from sitting on a single request long enough to time out.
//
// The trade-off: a failure part-way leaves the earlier batches saved. That is
// why CsvImportError carries the count - the operator needs to be told exactly
// how much went in, or they will import the same file again and get duplicates.

export const CSV_CHUNK_SIZE = 100

export class CsvImportError extends Error {
    readonly savedCount: number

    constructor(message: string, savedCount: number) {
        super(message)
        this.name = 'CsvImportError'
        this.savedCount = savedCount
    }
}

type ChunkResult = { error?: unknown } | void

function messageOf(error: unknown, fallback: string): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string') return message
    }
    return fallback
}

// PromiseLike, not Promise: the supabase shim's query builder is a thenable
// that awaits fine but is not a real Promise.
export async function insertInChunks<T>(
    rows: T[],
    saveChunk: (chunk: T[]) => PromiseLike<ChunkResult>,
    onProgress: (savedSoFar: number) => void,
    chunkSize: number = CSV_CHUNK_SIZE,
): Promise<void> {
    for (let start = 0; start < rows.length; start += chunkSize) {
        const chunk = rows.slice(start, start + chunkSize)

        let failure: unknown
        try {
            const result = await saveChunk(chunk)
            failure = result && typeof result === 'object' ? result.error : undefined
        } catch (thrown) {
            failure = thrown
        }

        if (failure) {
            throw new CsvImportError(messageOf(failure, 'Could not save the rows'), start)
        }

        onProgress(start + chunk.length)
    }
}

// Message for the toast after a partial import, so the number saved is never
// left implied.
export function partialImportMessage(error: CsvImportError, total: number): string {
    if (error.savedCount === 0) return error.message
    return `Saved ${error.savedCount} of ${total} rows, then stopped: ${error.message}`
}
