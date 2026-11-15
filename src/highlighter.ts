// Pierre's highlighter: a WebAssembly lexer for 152 languages that colors thousands of lines in a few milliseconds.
// This file is loaded on demand, the first time a page has a code block.
import { codeToTokens, isSupportedLanguage } from "@pierre/highlights";
import dark from "@pierre/highlights/themes/pierre-dark-soft";
import light from "@pierre/highlights/themes/pierre-light-soft";

/** A run of code and the colors it takes in each theme, as CSS custom properties. */
export interface ColoredRange {
  from: number;
  to: number;
  style: string;
}

/** Colors `code` for both themes at once. A language the highlighter doesn't know gets no colors. */
export function colorCode(code: string, language: string): ColoredRange[] {
  if (!isSupportedLanguage(language)) return [];
  const { tokens } = codeToTokens(code, { lang: language, themes: { light, dark }, defaultColor: false });
  return tokens.flat().flatMap((token) => {
    if (!token.htmlStyle || !token.content.trim()) return [];
    const style = Object.entries(token.htmlStyle)
      .map(([property, value]) => `${property}:${value}`)
      .join(";");
    return [{ from: token.offset, to: token.offset + token.content.length, style }];
  });
}
