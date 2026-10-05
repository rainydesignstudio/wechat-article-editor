export type ArticleDocumentToken = {
  readonly root: object | null;
  readonly articleId: string;
  readonly generation: number;
};

type DeleteToken = {
  readonly key: string;
  readonly previousGeneration: number;
  readonly generation: number;
};

export function createArticleMutationQueue() {
  let pending: Promise<unknown> = Promise.resolve();
  let nextRootId = 1;
  const rootIds = new WeakMap<object, number>();
  const generations = new Map<string, number>();
  const deleting = new Map<string, DeleteToken>();

  const scopeKey = (root: object | null, articleId: string): string => {
    if (!root) return JSON.stringify([0, articleId]);
    let rootId = rootIds.get(root);
    if (!rootId) {
      rootId = nextRootId;
      nextRootId += 1;
      rootIds.set(root, rootId);
    }
    return JSON.stringify([rootId, articleId]);
  };

  return {
    run<T>(operation: () => T | Promise<T>): Promise<T> {
      const result = pending.then(operation, operation);
      pending = result.then(() => undefined, () => undefined);
      return result;
    },

    openDocument(root: object | null, articleId: string): ArticleDocumentToken | null {
      const key = scopeKey(root, articleId);
      if (deleting.has(key)) return null;
      const generation = (generations.get(key) ?? 0) + 1;
      generations.set(key, generation);
      return Object.freeze({ root, articleId, generation });
    },

    beginDelete(root: object, articleId: string): DeleteToken | null {
      const key = scopeKey(root, articleId);
      if (deleting.has(key)) return null;
      const previousGeneration = generations.get(key) ?? 0;
      const generation = previousGeneration + 1;
      generations.set(key, generation);
      const token = { key, previousGeneration, generation };
      deleting.set(key, token);
      return token;
    },

    finishDelete(token: DeleteToken): void {
      if (deleting.get(token.key) === token) deleting.delete(token.key);
    },

    failDelete(token: DeleteToken): void {
      if (deleting.get(token.key) !== token) return;
      deleting.delete(token.key);
      if (generations.get(token.key) === token.generation) {
        if (token.previousGeneration === 0) generations.delete(token.key);
        else generations.set(token.key, token.previousGeneration);
      }
    },

    isDeleting(root: object, articleId: string): boolean {
      return deleting.has(scopeKey(root, articleId));
    },

    canSave(token: ArticleDocumentToken): boolean {
      const key = scopeKey(token.root, token.articleId);
      return !deleting.has(key) && generations.get(key) === token.generation;
    },
  };
}
