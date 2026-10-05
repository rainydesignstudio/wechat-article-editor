const DATABASE_NAME = 'rainy-editor-directory-bookmark';
const STORE_NAME = 'handles';
const LAST_DIRECTORY_KEY = 'last-directory';
const LAST_DIRECTORY_ID_KEY = 'last-directory-id';
const directoryIds = new WeakMap<FileSystemDirectoryHandle, string>();

export function getDirectoryBookmarkId(handle: FileSystemDirectoryHandle): string | null {
  return directoryIds.get(handle) ?? null;
}

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
};

function openBookmarkDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('当前浏览器无法保存上次使用的资料目录。'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('无法打开本地目录记录。'));
    request.onblocked = () => { blocked = true; reject(new Error('本地目录记录正在被其他页面占用。')); };
  });
}

export async function loadLastDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const database = await openBookmarkDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    let request: IDBRequest;
    let idRequest: IDBRequest;
    let directoryId: string | null = null;
    try {
      transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      request = store.get(LAST_DIRECTORY_KEY);
      idRequest = store.get(LAST_DIRECTORY_ID_KEY);
      idRequest.onsuccess = () => {
        const value: unknown = request.result;
        if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'directory') return;
        directoryId = typeof idRequest.result === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(idRequest.result)
          ? idRequest.result : crypto.randomUUID();
        if (directoryId !== idRequest.result) store.put(directoryId, LAST_DIRECTORY_ID_KEY);
      };
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      const value: unknown = request.result;
      const handle = value && typeof value === 'object' && 'kind' in value && value.kind === 'directory'
        && 'getDirectoryHandle' in value && typeof value.getDirectoryHandle === 'function'
        ? value as FileSystemDirectoryHandle : null;
      if (handle && directoryId) directoryIds.set(handle, directoryId);
      resolve(handle);
    };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('无法读取上次使用的资料目录。')); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('读取资料目录记录已中止。')); };
  });
}

export async function saveLastDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const database = await openBookmarkDatabase();
  const directoryId = getDirectoryBookmarkId(handle) ?? crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(handle, LAST_DIRECTORY_KEY);
      transaction.objectStore(STORE_NAME).put(directoryId, LAST_DIRECTORY_ID_KEY);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => { database.close(); directoryIds.set(handle, directoryId); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('无法保存上次使用的资料目录。')); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('保存资料目录记录已中止。')); };
  });
}

export function queryDirectoryReadWritePermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  return (handle as PermissionHandle).queryPermission?.({ mode: 'readwrite' }) ?? Promise.resolve('prompt');
}

export function requestDirectoryReadWritePermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  return (handle as PermissionHandle).requestPermission?.({ mode: 'readwrite' }) ?? Promise.resolve('denied');
}
