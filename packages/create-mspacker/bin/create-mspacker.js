#!/usr/bin/env node
import { create, parseCreateArgs } from "../dist/index.js";

try {
  await create(parseCreateArgs(process.argv.slice(2)));
} catch (e) {
  console.error(`create-mspacker: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
