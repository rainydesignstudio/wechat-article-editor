import { composeLegacyEditorTheme, type EditorTheme } from './editorThemes';
import { saveEditorTheme } from './editorThemeLibrary';
import { saveEditorWorkspace, type EditorWorkspaceLoadResult } from './editorWorkspace';

export async function migrateLegacyEditorAppearance(
  root: FileSystemDirectoryHandle,
  loaded: EditorWorkspaceLoadResult,
  themes: EditorTheme[],
  libraryReady: boolean,
): Promise<{ loaded: EditorWorkspaceLoadResult; themes: EditorTheme[]; issue: string | null }> {
  const legacy = loaded.legacyAppearance;
  if (!legacy || loaded.issue) return { loaded, themes, issue: loaded.issue };
  let nextThemes = themes;
  try {
    if (!libraryReady) throw new Error('编辑器主题库未成功读取。');
    if (!(legacy.preset === 'sea-glass' && legacy.accent === 'teal' && legacy.font === 'sans')) {
      const theme = composeLegacyEditorTheme(legacy.preset, legacy.accent, legacy.font);
      const existing = themes.find((item) => item.id === theme.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(theme)) throw new Error('迁移主题 ID 与现有主题冲突。');
      if (!existing) {
        await saveEditorTheme(root, theme);
        nextThemes = [...themes, theme];
      }
    }
    const saved = await saveEditorWorkspace(root, loaded.workspace, {
      fileExists: loaded.fileExists,
      rawContent: loaded.rawContent,
    });
    return { loaded: saved, themes: nextThemes, issue: null };
  } catch (error) {
    return {
      loaded,
      themes: nextThemes,
      issue: `旧外观迁移未完成：${error instanceof Error ? error.message : String(error)} 原文件未改写。`,
    };
  }
}
