import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

export default defineConfig({
  integrations: [
    starlight({
      title: "MineScriptPacker",
      description: "Write Minecraft data packs in TypeScript, with a command library generated from the game itself.",
      plugins: [
        // API reference, generated from the doc comments in the code on every docs build.
        starlightTypeDoc({
          entryPoints: ["../packages/mspacker/src/runtime/index.ts", "../packages/mspacker/src/index.ts"],
          tsconfig: "../packages/mspacker/tsconfig.build.json",
          output: "reference/api",
          sidebar: { label: "API", collapsed: true },
          typeDoc: { excludeInternal: true, excludePrivate: true, disableSources: true, readme: "none", sort: ["kind", "alphabetical"] },
        }),
      ],
      sidebar: [
        {
          label: "Start here",
          items: ["getting-started", "guides/project-structure"],
        },
        {
          label: "Guides",
          items: [
            "guides/writing-functions",
            "guides/commands",
            "guides/execute",
            "guides/function-ids",
            "guides/macros",
            "guides/raw-content",
            "guides/dev-mode",
          ],
        },
        {
          label: "Reference",
          items: [
            "reference/configuration",
            "reference/cli",
            "reference/argument-types",
            "reference/versions",
            "reference/custom-parsers",
          ],
        },
        typeDocSidebarGroup,
      ],
    }),
  ],
});
