import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Justification (health-data disk usage, see EGO review / README "Local history"):
// This extension persists glucose readings locally so the user can query
// history beyond the short window returned by the LibreView API. Data is
// written ONLY to ~/.local/share/<uuid>/history.jsonl (XDG_DATA_HOME),
// directory created with mode 0700. Nothing is transmitted anywhere except
// to LibreView's own API (already required for the extension to function).
// No telemetry, no third-party sync. File is append-only JSONL, pruned to
// HISTORY_RETENTION_DAYS on each enable().
const HISTORY_FILENAME = 'history.jsonl';

export class HistoryStore {
    constructor(uuid) {
        this._dir = GLib.build_filenamev([GLib.get_user_data_dir(), uuid]);
        GLib.mkdir_with_parents(this._dir, 0o700);
        this._file = Gio.File.new_for_path(GLib.build_filenamev([this._dir, HISTORY_FILENAME]));
        this._cancellable = new Gio.Cancellable();
        this._lastTimestamp = null;
        this._queue = Promise.resolve();
    }

    destroy() {
        this._cancellable.cancel();
    }

    // Loads existing history, drops entries older than retentionDays, and
    // rewrites the file if anything was pruned. Sets the in-memory
    // dedupe cursor (_lastTimestamp) from the newest kept entry.
    async init(retentionDays) {
        let text;
        try {
            const [ok, contents] = await this._file.load_contents_async(this._cancellable);
            if (!ok) return;
            text = new TextDecoder().decode(contents);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                console.error(`LibreView Extension: history init failed: ${e}`);
            }
            return;
        }

        const rawLines = text.split('\n').filter(l => l.trim());
        const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
        const kept = [];
        for (const line of rawLines) {
            try {
                const entry = JSON.parse(line);
                if (entry.t >= cutoff) kept.push(entry);
            } catch (e) {
                // skip malformed line
            }
        }

        if (kept.length > 0) this._lastTimestamp = kept[kept.length - 1].t;
        if (kept.length < rawLines.length) {
            this._queue = this._queue.then(() => this._rewrite(kept));
        }
    }

    // Appends a single reading if newer than the last saved one. Fire-and-forget;
    // writes are serialized through _queue to avoid interleaving concurrent I/O.
    appendIfNew(timestampMs, value) {
        if (!Number.isFinite(timestampMs) || !Number.isFinite(value)) return;
        if (this._lastTimestamp !== null && timestampMs <= this._lastTimestamp) return;
        this._lastTimestamp = timestampMs;

        const line = `${JSON.stringify({ t: timestampMs, v: value })}\n`;
        this._queue = this._queue.then(() => this._append(line)).catch(e => {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                console.error(`LibreView Extension: history append failed: ${e}`);
            }
        });
    }

    // Reads all saved entries (used by the history view). Does not mutate state.
    async readAll() {
        try {
            const [ok, contents] = await this._file.load_contents_async(this._cancellable);
            if (!ok) return [];
            const text = new TextDecoder().decode(contents);
            const entries = [];
            for (const line of text.split('\n')) {
                if (!line.trim()) continue;
                try {
                    entries.push(JSON.parse(line));
                } catch (e) {
                    // skip malformed line
                }
            }
            return entries;
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                console.error(`LibreView Extension: history read failed: ${e}`);
            }
            return [];
        }
    }

    async _append(line) {
        const stream = await this._file.append_to_async(Gio.FileCreateFlags.NONE, GLib.PRIORITY_DEFAULT, this._cancellable);
        await stream.write_bytes_async(new GLib.Bytes(new TextEncoder().encode(line)), GLib.PRIORITY_DEFAULT, this._cancellable);
        await stream.close_async(GLib.PRIORITY_DEFAULT, this._cancellable);
    }

    async _rewrite(entries) {
        const text = entries.length ? `${entries.map(e => JSON.stringify(e)).join('\n')}\n` : '';
        await this._file.replace_contents_async(
            new TextEncoder().encode(text), null, false, Gio.FileCreateFlags.NONE, this._cancellable);
    }
}
