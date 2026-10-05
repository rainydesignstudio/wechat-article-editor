export const ARTICLE_EXAMPLE_IMAGE = '/article-sample.png';

// Legacy built-in snippets used these paths outside the article media directory.
export function isLegacyExampleImage(source: string): boolean {
  return /^(?:\.\/)?media\/image(?:-[ab])?\.png$/.test(source);
}
