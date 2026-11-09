/**
 * What you import from `mcjspacker2` itself: `defineConfig` for mcjs2.config.ts, and the pieces for
 * custom argument types (see "Custom argument types" in the reference).
 *
 * @packageDocumentation
 * @module Config (mcjspacker2)
 */
export { defineConfig, defineParser, type UserConfig } from "./config.js";
export {
  FORMAT_BELOW_NAME,
  FORMAT_SNBT_TEXT,
  PARSERS,
  type ParserContext,
  type ParserDef,
  type Props,
  type UserParserDef,
} from "./runtime/parsers.js";
export { parseNamespace, snake, type NamespaceSpec } from "./runtime/naming.js";
