#!/usr/bin/env node
/**
 * Thin launcher kept for backwards compatibility (`node scripts/export.mjs <user> …`).
 * The real CLI is scripts/export.ts, which imports the shared config schema from src/.
 */
import { register } from 'tsx/esm/api'

register()
await import('./export.ts')
