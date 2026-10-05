import assert from 'node:assert/strict';
import test from 'node:test';
import packageMetadata from '../package.json' with { type: 'json' };
import changelog from '../src/lib/changelog.json' with { type: 'json' };
const { APP_VERSION, APP_VERSION_COMPACT, formatAppVersion } = await import('../src/lib/appVersion.ts');

test('current app version derives from package metadata and supports four-part patch display', () => {
  assert.equal(APP_VERSION, formatAppVersion(packageMetadata.version));
  assert.equal(APP_VERSION_COMPACT, APP_VERSION.split('.').slice(0, 2).join('.'));
  assert.equal(formatAppVersion('0.1.3+patch.1'), '0.1.3.1');
  assert.equal(formatAppVersion('0.1.3'), '0.1.3');
  assert.equal(formatAppVersion('0.1.3-beta.1'), '0.1.3-beta.1');
});

test('release records have unique versions, supported status, and a current-version entry', () => {
  assert.equal(new Set(changelog.map((release) => release.version)).size, changelog.length);
  assert.ok(changelog.some((release) => release.version === APP_VERSION));
  for (const release of changelog) {
    assert.ok(['local', 'published', 'in-progress'].includes(release.status));
    assert.ok(release.summary.trim());
  }
});

test('the first public version is 0.2.0 and earlier changes remain local version records', () => {
  assert.equal(changelog.find(release => release.status === 'published')?.version, '0.2.0');
  for (const release of changelog.filter(release => release.version.startsWith('0.1.'))) assert.equal(release.status, 'local');
  const preparation = changelog.find(release => release.version === '0.1.8');
  assert.equal(preparation.sections.at(-1).title, '本地落版与开源准备');
  assert.equal(preparation.sections.at(-1).items[0], '0.1.8完成本地验收与落版，采用MIT许可，并准备源码与静态发布候选包。');
});
