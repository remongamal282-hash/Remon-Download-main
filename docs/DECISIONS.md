# Decisions

Decision:
Initialize the repository as a Vite React TypeScript prototype because no existing `package.json` or `src/` directory was present.

Reason:
`docs/SPEC.md` Section 40 requires project initialization when no project exists, while preserving the required stack and feature order.

Date:
2026-08-14

Decision:
Keep non-Dashboard pages as routed empty states until their feature turn.

Reason:
The implementation order requires Dashboard first and forbids building the whole prototype in one large pass. Empty routed pages preserve navigation structure without prematurely implementing later features.

Date:
2026-08-14
