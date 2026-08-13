#!/bin/sh
set -eu
corepack pnpm exec tsx scripts/verify-runtime-isolation.ts
