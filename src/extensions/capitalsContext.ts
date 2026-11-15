import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { findCapital, type Capital, type CapitalRules } from "../tinyfix/capitals";

/** Enough earlier text to see where the sentence started and how this page starts its sentences. */
const CONTEXT_CHARACTERS = 1000;

/**
 * The page's text before `pos`, one line per block, starting after the last heading. A heading never takes a full
 * stop, so the line after it starts a sentence; any other line starts one only after a closing mark.
 */
function textBefore(doc: ProseMirrorNode, pos: number): string {
  let from = Math.max(0, pos - CONTEXT_CHARACTERS);
  doc.nodesBetween(from, pos, (node, nodePos) => {
    const end = nodePos + node.nodeSize;
    if (node.type.name === "heading" && end <= pos) from = Math.max(from, end);
    return !node.isTextblock;
  });
  return doc.textBetween(from, pos, "\n", "\n");
}

/** The capital for the word at `from`, or null. Words in inline code are never changed. */
export function findCapitalAt(doc: ProseMirrorNode, from: number, word: string, boundary: string, rules: CapitalRules): Capital | null {
  const code = doc.type.schema.marks.code;
  if (code && doc.rangeHasMark(from, from + word.length, code)) return null;
  return findCapital(word, textBefore(doc, from), boundary, rules);
}
