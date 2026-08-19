/**
 * Spill: save the full original before cutting, so nothing is ever lost.
 *
 * Borrowed from DeepSeek Harness, which saves oversized results to disk and
 * shows the model a locator plus a retrieval hint. Here the store is an
 * interface, so a host can plug its own storage. The default writes files.
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
/**
 * The default store: one file per spill, named by content hash, so saving the
 * same output twice costs one file. Old files are cleaned on save.
 */
export class FileSpillStore {
    dir;
    maxAgeMs;
    constructor(options) {
        this.dir = options.dir;
        this.maxAgeMs = (options.maxAgeHours ?? 24) * 3_600_000;
        mkdirSync(this.dir, { recursive: true });
    }
    save(text, hint) {
        this.cleanup();
        const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
        const tool = (hint.tool ?? 'tool').replace(/[^a-z0-9_-]/gi, '_');
        const locator = `spill:${tool}-${hash}`;
        writeFileSync(join(this.dir, `${tool}-${hash}.txt`), text);
        return locator;
    }
    load(locator) {
        const name = locator.replace(/^spill:/, '');
        if (!/^[a-z0-9_-]+$/i.test(name))
            throw new Error(`bad spill locator: ${locator}`);
        try {
            return readFileSync(join(this.dir, `${name}.txt`), 'utf8');
        }
        catch {
            throw new Error(`no spill stored for: ${locator}`);
        }
    }
    cleanup() {
        const cutoff = Date.now() - this.maxAgeMs;
        let entries;
        try {
            entries = readdirSync(this.dir);
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (!entry.endsWith('.txt'))
                continue;
            const path = join(this.dir, entry);
            try {
                if (statSync(path).mtimeMs < cutoff)
                    unlinkSync(path);
            }
            catch {
                // A file removed by another process mid-scan is already what we want.
            }
        }
    }
}
//# sourceMappingURL=spill.js.map