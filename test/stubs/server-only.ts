// Stub for the `server-only` package under Vitest.
//
// The real package throws on import to guarantee a module never reaches a
// client bundle. That guarantee is enforced at build time by `next build`,
// which fails if a "use client" module imports a server-only one. Vitest has
// no such notion, so it would throw for every server module under test.
export {};
