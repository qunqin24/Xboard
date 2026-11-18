// Write the OpenAPI document built from @xboard/contracts, for review in Git
// and for tools that read a file. The running API serves the same document at /api/docs.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildOpenApi, buildOpsOpenApi } from "@xboard/contracts";

for (const [file, document] of [
    ["openapi.json", buildOpenApi()],
    ["ops-openapi.json", buildOpsOpenApi()],
] as const) {
    const target = resolve(
        import.meta.dirname,
        "../../../packages/contracts",
        file,
    );
    await writeFile(target, `${JSON.stringify(document, null, 4)}\n`);
    console.log(`Wrote ${target}`);
}
