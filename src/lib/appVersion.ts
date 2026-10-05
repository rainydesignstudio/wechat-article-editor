import packageMetadata from '../../package.json' with { type: 'json' };

export function formatAppVersion(version: string): string {
  return version.replace(/^(\d+\.\d+\.\d+)\+patch\.(\d+)$/, '$1.$2');
}

export const APP_VERSION = formatAppVersion(packageMetadata.version);
export const APP_VERSION_COMPACT = APP_VERSION.split('.').slice(0, 2).join('.');
