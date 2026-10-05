import { parseThemeConfigJson } from '../../lib/themeValidation';
import basicJson from './article-theme-basic.json' with { type: 'json' };
import rainyJson from './article-theme-rainy.json' with { type: 'json' };
import qingyanJson from './article-theme-qingyan.json' with { type: 'json' };
import nuanjianJson from './article-theme-nuanjian.json' with { type: 'json' };
import mokanJson from './article-theme-mokan.json' with { type: 'json' };
import jiangyuJson from './article-theme-jiangyu.json' with { type: 'json' };
import zixuJson from './article-theme-zixu.json' with { type: 'json' };

export const BASIC_THEME = parseThemeConfigJson(JSON.stringify(basicJson));
export const RAINY_THEME = parseThemeConfigJson(JSON.stringify(rainyJson));
export const ARTICLE_THEME_PRESETS = [qingyanJson, nuanjianJson, mokanJson, jiangyuJson, zixuJson]
  .map(source => parseThemeConfigJson(JSON.stringify(source)));
export const THEMES = [BASIC_THEME, RAINY_THEME, ...ARTICLE_THEME_PRESETS];
