#!/usr/bin/env node
/**
 * register.mjs — install the workspace TypeScript resolver for a Node test
 * command (`node --import ./packages/testing/register.mjs ...`).
 *
 * The workspace packages publish `.ts` sources, and Node's type stripping
 * refuses files below `node_modules`; the resolver maps their scope back into
 * `packages/`. See packages/testing/ts-resolve-hooks.mjs.
 */
import { register } from 'node:module'

register(new URL('./ts-resolve-hooks.mjs', import.meta.url))
