# Dependency exposure review — October 8, 2026

This is a scoped code/dependency/build review, not a penetration test or a clean release sign-off. No production deployment or manuscript edits were performed.

## Shipped staff code

The generated production JavaScript source maps contain React Router and ExcelJS (including its embedded UUID implementation). Searches of all three JavaScript bundle maps found no source paths for @grpc/grpc-js, braces, node-forge, nth-check, PostCSS, serialize-javascript, sprintf-js, SVGO, Underscore, or webpack development middleware/server. This establishes absence from the inspected map source lists, not proof about every artifact or future build.

- React Router remains affected by advisory version ranges. Current application navigation uses fixed `/login`, `/coordinator`, and `/admin` destinations. No attacker-controlled Link/useNavigate destination or SSR hydration entry point was found in the source search. These affected paths were not demonstrated reachable in current usage; the dependency remains open for a tested major-version migration.
- ExcelJS ships an embedded UUID implementation. Its library call site uses v4 for conditional-format identifiers, whereas the reported buffer-bounds advisory concerns v3/v5/v6 with caller-provided buffers. Application exports call xlsx.writeBuffer; xlsx.load appears in export regression tests rather than the inspected application export flow. Do not override the top-level UUID and claim the prebundled ExcelJS implementation is fixed.
- Firebase's flagged gRPC package is a Node transport. It does not appear in the staff production bundle maps. Student Firestore's declared browser and React Native entry files also contain no direct @grpc/grpc-js references. Native graph-wide absence was not verified in this pass; this is not proof of zero student runtime risk.

## Build/test/development exposure

Staff dependency chains place Underscore under react-scripts → bfj → jsonpath, and @tootallnate/once under Jest → jsdom → http-proxy-agent. Other flagged CSS/SVG/serialization packages are associated with build tools; webpack server/middleware findings affect development services and must not be dismissed as harmless merely because static hosting excludes them.

Student image-size is under Metro, PostCSS under Expo Metro config, node-forge under Expo CLI/certificate tooling, braces under Metro's micromatch, and UUID under xcode/config tooling. No patched current-major releases were available from the registry for image-size 1.x, braces 3.x, or node-forge 1.x at review time. Updating them would require compatibility work, not a blind forced install. Expo's PostCSS parent pins 8.4.49; staff resolve-url-loader uses PostCSS 7, so a global PostCSS replacement would cross declared requirements.

Build only trusted repository assets; do not process arbitrary uploaded CSS/SVG/images through the vulnerable build pipeline. Keep developer servers off public hosting, retain origin/host checks, and deploy generated static staff assets rather than react-scripts start. Prefer an intentional staff build-tool migration over replacing react-scripts with npm audit's suggested 0.0.0 package.

## Narrow patch applied

jsonpath pins Underscore 1.13.6. A scoped package override now resolves jsonpath's Underscore to patched 1.13.8, without changing its major/minor series or unrelated dependencies. npm install changed one package. Staff findings fell from 106 to 103 (64 high, 36 moderate, three low, zero critical). Student remained unchanged in this pass; its previous fresh count was 40. Counts can change as advisories are published.

All 44 staff tests across 16 suites passed after the patch; the existing App.test.js act warning remains. The staff production rebuild compiled successfully and emitted the same JavaScript chunk hashes as before the toolchain-only patch. Physical-phone and browser journey acceptance were not performed in this pass.
