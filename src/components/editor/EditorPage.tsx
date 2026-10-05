'use client';

import { useEditorControllerContext } from '../global/AppProviders';
import { EditorWorkspace } from './EditorWorkspace';
import { availableArticleThemeUpdate } from '../../lib/articleThemeUpdate';

export function EditorPage() {
  const controller = useEditorControllerContext();
  const mediaBusy = controller.mediaOperation !== null || controller.historyBusy;

  if (!controller.directory || (!controller.article.folder && !controller.article.source.trim())) {
    return (
      <section className="editor-unavailable" aria-labelledby="editor-unavailable-title">
        <p id="editor-unavailable-kicker" className="eyebrow">ARTICLE EDITOR</p>
        <h2 id="editor-unavailable-title" className="page-title font-heading">{controller.directory ? '先选择一篇文章或新建文稿' : '选择资料目录后才能编辑'}</h2>
        <p className="mt-3">{controller.directory ? '空白工作区不会自动创建临时稿。回到文章总览打开文章，或使用“新建文章”开始。' : '文章和图片保存在你选择的本地目录中。当前没有演示稿，也没有临时写稿模式。'}</p>
        <div className="editor-unavailable-actions">
          {controller.directory ? <><button className="button button-quiet" type="button" onClick={() => controller.navigateArticleMode('overview')}>返回文章总览</button><button className="button button-primary" type="button" onClick={controller.createNewArticle}>新建文章</button></> : <button className="button button-primary" type="button" onClick={() => controller.navigateView('settings')}>前往设置选择目录</button>}
        </div>
      </section>
    );
  }

  return (
    <EditorWorkspace
      article={controller.article}
      themeUpdateAvailable={Boolean(availableArticleThemeUpdate(controller.article.theme, controller.themeLibrary))}
      parsed={controller.parsed}
      compiledCss={controller.compiledCss}
      revision={controller.revision}
      mediaRevision={controller.mediaRefreshRevision}
      status={controller.status}
      mobilePane={controller.mobilePane}
      directory={controller.directory}
      snippets={controller.snippets}
      snippetCategories={controller.snippetCategories}
      previewRef={controller.previewRef}
      attachPreview={controller.attachPreview}
      clipboardReceiverRef={controller.clipboardReceiverRef}
      sourceTextareaRef={controller.sourceTextareaRef}
      onChangeBody={controller.updateArticleBody}
      onSnippetInserted={() => { void controller.compileCurrent(); }}
      onOpenInfo={() => controller.openArticleInfo()}
      onOpenMediaPicker={() => controller.openMediaPicker()}
      onOpenTheme={() => controller.setShowThemeDialog(true)}
      onPaste={controller.pasteRichText}
      onImportFiles={controller.importImages}
      onPasteConflict={() => controller.setStatus({ label: '剪贴板同时包含文字和图片；为保留文字，本次只执行普通粘贴。请单独复制截图再导入。', tone: 'warning' })}
      onSetMobilePane={controller.setMobilePane}
      media={controller.articleMediaContext}
      mediaBusy={mediaBusy}
      readOnly={controller.currentArticleIsArchived}
    />
  );
}
