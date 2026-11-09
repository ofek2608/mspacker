import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "mcjspacker2",
      description: "Write Minecraft data packs in TypeScript, with a command library generated from the game itself.",
      sidebar: [
        {
          label: "Start here",
          items: ["getting-started", "guides/project-structure"],
        },
        {
          label: "Guides",
          items: [
            "guides/writing-functions",
            "guides/function-ids",
            "guides/commands",
            "guides/execute",
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
            "reference/custom-parsers",
            "reference/versions",
          ],
        },
      ],
    }),
  ],
});
