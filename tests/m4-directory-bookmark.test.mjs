import assert from 'node:assert/strict';
import test from 'node:test';
const bookmark = await import('../src/lib/directoryBookmark.ts');

// Transactional IDB fixture: reads retain request order and aborted writes roll back.
function databaseFixture(initial = []) {
  const values = new Map(initial);
  let abortNext = false;
  const database = {
    close() {},
    transaction(_store, mode) {
      const working = new Map(values);
      const transaction = { error: new Error('simulated transaction abort') };
      let pending = 0;
      const request = operation => {
        pending++;
        const result = {};
        queueMicrotask(() => {
          result.result = operation(); result.onsuccess?.(); pending--;
          queueMicrotask(() => {
            if (pending || transaction.finished) return;
            transaction.finished = true;
            if (abortNext) { abortNext = false; transaction.onabort?.(); return; }
            if (mode === 'readwrite') { values.clear(); for (const entry of working) values.set(...entry); }
            transaction.oncomplete?.();
          });
        });
        return result;
      };
      transaction.objectStore = () => ({ get: key => request(() => working.get(key)), put: (value, key) => request(() => working.set(key, value)) });
      return transaction;
    },
  };
  return { values, abort() { abortNext = true; }, open() { const request = { result: database }; queueMicrotask(() => request.onsuccess?.()); return request; } };
}
function handle() { return { kind: 'directory', name: 'data', getDirectoryHandle() {} }; }

test('directory bookmarks migrate legacy handles and retain an opaque identity across reloads', async () => {
  const root = handle();
  const db = databaseFixture([['last-directory', root]]);
  const before = globalThis.indexedDB;
  globalThis.indexedDB = db;
  try {
    assert.equal(await bookmark.loadLastDirectoryHandle(), root);
    const id = bookmark.getDirectoryBookmarkId(root);
    assert.match(id, /^[a-zA-Z0-9-]+$/);
    assert.equal(db.values.get('last-directory-id'), id);
    const restored = handle();
    db.values.set('last-directory', restored);
    assert.equal(await bookmark.loadLastDirectoryHandle(), restored);
    assert.equal(bookmark.getDirectoryBookmarkId(restored), id);
  } finally { globalThis.indexedDB = before; }
});

test('same-named directories get separate identities; abort preserves the previous handle and ID', async () => {
  const a = handle(); const b = handle(); const failed = handle();
  const db = databaseFixture(); const before = globalThis.indexedDB; globalThis.indexedDB = db;
  try {
    await bookmark.saveLastDirectoryHandle(a);
    const aId = bookmark.getDirectoryBookmarkId(a);
    await bookmark.saveLastDirectoryHandle(b);
    const bId = bookmark.getDirectoryBookmarkId(b);
    assert.notEqual(aId, bId);
    db.abort();
    await assert.rejects(bookmark.saveLastDirectoryHandle(failed), /abort/);
    assert.equal(bookmark.getDirectoryBookmarkId(failed), null);
    assert.equal(db.values.get('last-directory'), b);
    assert.equal(db.values.get('last-directory-id'), bId);
    assert.equal(await bookmark.loadLastDirectoryHandle(), b);
  } finally { globalThis.indexedDB = before; }
});
