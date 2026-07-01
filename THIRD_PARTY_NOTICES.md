# Third-Party Notices

RTApps RadTherapyPlatform is built on the following open-source, free-to-use
libraries. Each retains its own license; this file is a running index, not
a substitute for the license text bundled with each package under
`node_modules/<package>/LICENSE`.

| Library        | Purpose                                   | License    |
| -------------- | ------------------------------------------ | ---------- |
| three.js       | 3D rendering (RenderingService)            | MIT        |
| Vite           | Build tooling / dev server                 | MIT        |
| TypeScript     | Language / type checking                   | Apache-2.0 |
| Vitest         | Unit testing                               | MIT        |
| ESLint         | Linting                                    | MIT        |
| Prettier       | Formatting                                 | MIT        |

Planned additions (Phase 3+, per the architecture brief):

| Library     | Purpose                                        | License |
| ----------- | ----------------------------------------------- | ------- |
| Cornerstone3D | DICOM image rendering / viewport toolkit       | MIT     |
| dcmjs       | DICOM parsing / manipulation                     | MIT     |
| vtk.js      | Volumetric / scientific 3D visualization         | BSD-3   |
| Chart.js    | DVH and analytics charting                       | MIT     |

Keep this table updated whenever `package.json` dependencies change.
