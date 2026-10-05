import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { parseStaticServerOptions } from '../scripts/static-server-options.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('client directives stay in the directive prologue before imports and runtime statements', async () => {
  const visit = async directory => {
    for (const entry of await readdir(new URL(directory, root), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!/\.tsx?$/.test(file)) continue;
      const source = await read(file);
      if (!/^\s*['"]use client['"];?/m.test(source)) continue;
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const directives = [];
      for (const statement of ast.statements) {
        if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
        directives.push(statement.expression.text);
      }
      assert.ok(directives.includes('use client'), `${file}: use client follows another statement`);
    }
  };
  await visit('src');
});

test('M1 keeps the static, local-only application boundary', async () => {
  const [packageJson, nextConfig, controller, topbar, editorPage, articlesPage, settingsPage, fileSystem, startScript, globals, components, controls] = await Promise.all([
    read('package.json').then(JSON.parse),
    read('next.config.mjs'),
    read('src/hooks/useEditorController.ts'),
    read('src/components/global/EditorTopbar.tsx'),
    read('src/components/editor/EditorPage.tsx'),
    read('src/components/articles/ArticlesPage.tsx'),
    read('src/app/settings/page.tsx'),
    read('src/lib/fileSystem.ts'),
    read('scripts/start-static.mjs'),
    read('src/styles/globals.css'),
    read('src/styles/components.css'),
    read('src/styles/components-controls.css'),
  ]);

  assert.equal(packageJson.scripts.build, 'next build --webpack');
  assert.match(nextConfig, /output:\s*['"]export['"]/);
  assert.match(controller, /ClipboardItem/);
  assert.match(controller, /['"]text\/html['"]/);
  assert.match(controller, /['"]text\/plain['"]/);
  assert.match(controller, /const \[fileSystemReady, setFileSystemReady\] = useState\(false\)/);
  assert.match(controller, /setFileSystemReady\(supported\)/);
  assert.match(controller, /loadLastDirectoryHandle\(\)/);
  assert.match(controller, /queryDirectoryReadWritePermission\(handle\)/);
  assert.match(topbar, /aria-label="从当前文章创建起稿模板"/);
  assert.match(topbar, /aria-label="导出文章"/);
  assert.match(controller, /beforeunload/);
  assert.match(editorPage, /<EditorWorkspace/);
  assert.match(articlesPage, /collection === 'archived'/);
  assert.match(settingsPage, /<SettingsPanel/);
  assert.match(globals, /@layer theme, base, components, utilities/);
  assert.match(globals, /@import "\.\/components\.css";/);
  assert.match(globals, /@source "\.\.\/components\/\*\*\/\*\.\{ts,tsx\}"/);
  assert.match(components, /components-shell\.css/);
  assert.match(components, /components-editor\.css/);
  assert.match(components, /components-controls\.css/);
  assert.match(components, /components-dialog\.css/);
  assert.match(controls, /\.clipboard-dock/);
  assert.match(controls, /\.clipboard-dock-toggle/);
  assert.match(controls, /\.clipboard-dock-body/);
  assert.match(controls, /overflow-auto/);
  assert.match(controls, /\.clipboard-receiver/);
  assert.match(controls, /min-w-0/);
  assert.match(controls, /wrap-anywhere/);
  assert.match(startScript, /requestedPath\.startsWith/);
  assert.match(startScript, /requestedStat\.isDirectory\(\)/);
  assert.match(startScript, /path\.join\(requestedPath, 'index\.html'\)/);
  assert.match(startScript, /contentSecurityPolicy\(filePath\)/);
  assert.match(startScript, /\.txt': 'text\/x-component; charset=utf-8'/);
  assert.match(fileSystem, /Front Matter 未通过校验/);
  assert.deepEqual(parseStaticServerOptions([]), { port: 3500, help: false });
  assert.match(startScript, /const host = '127\.0\.0\.1'/);
  assert.match(startScript, /parseStaticServerOptions\(process\.argv\.slice\(2\)\)/);
  assert.match(startScript, /server\.listen\(port, host/);
});

test('Tailwind source architecture and fixture cover the M1 proof points', async () => {
  const [globals, theme, editorTheme, fixture, lockfile, script, postcss] = await Promise.all([
    read('src/styles/globals.css'),
    read('src/styles/theme.css'),
    read('src/styles/editor-theme.css'),
    read('src/lib/fixtures.ts'),
    read('package-lock.json').then(JSON.parse),
    read('scripts/generate-tailwind-assets.mjs'),
    read('postcss.config.mjs'),
  ]);

  assert.match(globals, /@import "tailwindcss\/theme\.css" layer\(theme\)/);
  assert.match(globals, /@import "tailwindcss\/utilities\.css" layer\(utilities\)/);
  assert.match(globals, /@import "\.\/editor-theme\.css" layer\(theme\)/);
  assert.match(theme, /--color-sea-glass-100/);
  assert.match(editorTheme, /--color-accent/);
  assert.match(script, /TAILWIND_THEME_CSS/);
  assert.doesNotMatch(script, /UI_CANDIDATES|generated-ui/);
  assert.match(postcss, /@tailwindcss\/postcss/);
  assert.match(fixture, /标准文章闭环/);
  assert.match(fixture, /明确标为实验/);
  for (const [name, version] of Object.entries({ next: '16.3.4', tailwindcss: '4.3.3', '@tailwindcss/postcss': '4.3.3', 'rehype-raw': '7.0.0', 'rehype-sanitize': '6.0.0' })) {
    assert.equal(lockfile.packages[`node_modules/${name}`].version, version);
  }
});
