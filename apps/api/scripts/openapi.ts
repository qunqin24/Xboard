// Write the OpenAPI document built from @xboard/contracts, for review in Git
// and for tools that read a file. The running API serves the same document at /api/docs.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildOpenApi } from "@xboard/contracts";

const target = resolve(
    import.meta.dirname,
    "../../../packages/contracts/openapi.json",
);
await writeFile(target, `${JSON.stringify(buildOpenApi(), null, 4)}\n`);
console.log(`Wrote ${target}`);
