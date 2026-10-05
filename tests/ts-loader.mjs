import { access } from 'node:fs/promises';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && !/[.][a-z]+$/i.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      try {
        await access(candidate);
        return nextResolve(candidate.href, context);
      } catch {
        // Keep the original resolution error for non-TypeScript imports.
      }
    }
    throw error;
  }
}
