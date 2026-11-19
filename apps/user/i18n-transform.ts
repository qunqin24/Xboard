import ts from "typescript";
import { resolve } from "node:path";
import { normalizePath, type Plugin } from "vite";

type Edit = { start: number; end: number; value: string };
const hasChinese = /\p{Script=Han}/u;
const call = (key: string, values?: string[]) =>
    `__xboardText(${JSON.stringify(key)}${values ? `, [${values.join(", ")}]` : ""})`;

function jsxText(value: string) {
    const lines = value
        .split(/\r\n|\n|\r/)
        .map((line) => line.replace(/\t/g, " "));
    let last = lines.length - 1;
    while (last >= 0 && !lines[last]?.trim()) last--;
    return last < 0
        ? ""
        : lines
              .map((line, i) => {
                  const text = i === 0 ? line : line.trimStart();
                  const visible =
                      i === lines.length - 1 ? text : text.trimEnd();
                  return visible && i < last ? `${visible} ` : visible;
              })
              .join("");
}

function applyEdits(
    source: string,
    edits: Edit[],
    first: number,
    last: number,
) {
    let cursor = first;
    let output = "";
    for (const edit of edits) {
        output += source.slice(cursor, edit.start) + edit.value;
        cursor = edit.end;
    }
    return output + source.slice(cursor, last);
}

/** Wrap display literals at build time, leaving API data and source types intact. */
export function localizeSource(
    source: string,
    filename: string,
    capture: (key: string) => void = () => {},
) {
    if (!hasChinese.test(source)) return null;
    const tree = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
    );
    const edits: Edit[] = [];
    function walk(node: ts.Node, found: Edit[]) {
        if (ts.isTypeNode(node)) return;
        const edit = (
            key: string,
            output: (text: string) => string,
            values?: string[],
        ) => {
            if (!hasChinese.test(key)) return false;
            const surrounding = key.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
            const message = surrounding[2]!;
            if (!message) return false;
            capture(message);
            const text = call(message, values);
            const rendered =
                surrounding[1] || surrounding[3]
                    ? `(${JSON.stringify(surrounding[1])} + ${text} + ${JSON.stringify(surrounding[3])})`
                    : text;
            found.push({
                start: ts.isJsxText(node)
                    ? node.getFullStart()
                    : node.getStart(tree),
                end: node.end,
                value: output(rendered),
            });
            return true;
        };
        if (
            ts.isJsxText(node) &&
            edit(jsxText(node.getFullText(tree)), (text) => `{${text}}`)
        )
            return;
        if (
            ts.isTemplateExpression(node) &&
            !ts.isTaggedTemplateExpression(node.parent)
        ) {
            const key =
                node.head.text +
                node.templateSpans
                    .map((span, index) => `{${index}}${span.literal.text}`)
                    .join("");
            if (hasChinese.test(key)) {
                const values = node.templateSpans.map(({ expression }) => {
                    const parts: Edit[] = [];
                    walk(expression, parts);
                    return applyEdits(
                        source,
                        parts,
                        expression.getStart(tree),
                        expression.end,
                    );
                });
                if (edit(key, (text) => text, values)) return;
            }
        }
        if (
            ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node)
        ) {
            const parent = node.parent;
            if (
                ts.isImportDeclaration(parent) ||
                ts.isExportDeclaration(parent) ||
                ts.isModuleDeclaration(parent) ||
                ts.isTaggedTemplateExpression(parent) ||
                ts.isEnumMember(parent) ||
                ts.isImportAttribute(parent) ||
                (ts.isExpressionStatement(parent) && parent.parent === tree)
            )
                return;
            if (ts.isPropertyAssignment(parent) && parent.name === node) {
                edit(node.text, (text) => `[${text}]`);
                return;
            }
            if (
                edit(node.text, (text) =>
                    ts.isJsxAttribute(parent) ? `{${text}}` : text,
                )
            )
                return;
        }
        node.forEachChild((child) => walk(child, found));
    }
    walk(tree, edits);
    if (!edits.length) return null;
    return applyEdits(source, edits, 0, source.length);
}

export function xboardLocales(): Plugin {
    let sourceFolder = "";
    return {
        name: "xboard-locales",
        enforce: "pre",
        configResolved(config) {
            sourceFolder = normalizePath(resolve(config.root, "src")) + "/";
        },
        transform(code, id) {
            const filename = id.split("?")[0]!;
            if (code.includes("uiText as __xboardText")) return;
            if (
                !/\/src\/.*\.tsx?$/.test(filename) ||
                !filename.startsWith(sourceFolder) ||
                filename.endsWith(".test.ts") ||
                filename.endsWith("/i18n.ts") ||
                filename.endsWith("/locale-control.tsx")
            )
                return;
            const output = localizeSource(code, filename);
            if (output)
                return {
                    code: `import { uiText as __xboardText } from "@/i18n";\n${output}`,
                    map: null,
                };
        },
    };
}
