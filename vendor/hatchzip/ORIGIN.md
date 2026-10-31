# HatchZip runtime

Orbit bundles the Windows x64 command-line executable from HatchZip v0.1.2.

- Repository: https://github.com/xevrion/hatchzip
- Source commit: `2b754c85b9322da64186e5e199ed22b1e45a5cce`
- Release: https://github.com/xevrion/hatchzip/releases/tag/v0.1.2
- Asset: `hatchzip-x86_64-windows.zip`
- Published asset SHA-256, verified before extraction: `76aef08f88a3ccf5cb96dd98e8cb4bcaf3456df79394d49322dc1a04d9dbbfbb`
- Bundled executable SHA-256: `402d8efeb5506cf2e1aaa550801ba081960b61df106f8e05d34d9456bd776247`
- License: MIT OR Apache-2.0. Both upstream license texts accompany the binary.

No global installation, shell extension, installer, or PATH change is needed.
Orbit uses this executable only on its private staged ZIP/7z copies, after its
own path/link/size validation, with `--verify-first` and a 256 MiB free-space
reserve. The source archive is consumed; interrupted jobs keep the journal,
validated entry manifest, extracted files, and import transaction for retry.
