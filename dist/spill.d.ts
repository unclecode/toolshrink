/**
 * Spill: save the full original before cutting, so nothing is ever lost.
 *
 * Borrowed from DeepSeek Harness, which saves oversized results to disk and
 * shows the model a locator plus a retrieval hint. Here the store is an
 * interface, so a host can plug its own storage. The default writes files.
 */
export interface SpillStore {
    /** Save the full text. Returns a locator the model can quote to ask for it. */
    save(text: string, hint: {
        tool?: string;
    }): string;
    /** Load the text behind a locator. Throws when the locator is unknown. */
    load(locator: string): string;
}
export interface FileSpillStoreOptions {
    /** Directory for spill files. Created when missing. */
    readonly dir: string;
    /** Delete spill files older than this many hours during save. Default 24. */
    readonly maxAgeHours?: number;
}
/**
 * The default store: one file per spill, named by content hash, so saving the
 * same output twice costs one file. Old files are cleaned on save.
 */
export declare class FileSpillStore implements SpillStore {
    private readonly dir;
    private readonly maxAgeMs;
    constructor(options: FileSpillStoreOptions);
    save(text: string, hint: {
        tool?: string;
    }): string;
    load(locator: string): string;
    private cleanup;
}
