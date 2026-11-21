# Bundled archive tool

7-Zip 26.04, released 2026-10-05. The unmodified Windows x64 `7z.exe` and `7z.dll` are used for ZIP, 7z and RAR listing and extraction. Orbit never executes an archive's contents.

- Official downloads: https://www.7-zip.org/download.html
- Binary distribution: https://github.com/ip7z/7zip/releases/download/26.04/7z2604-x64.exe (unpacked as an archive, never run)
- Published asset SHA-256, verified before unpacking: `d54bf805f9f3704d1e8db2fa3498ae7ef2df0312b40b558e7c71c734430a665d`
- Corresponding source: https://github.com/ip7z/7zip/releases/tag/26.04
- `7z.exe` SHA-256: `95fff19b73eff77c87c0d7bd32822e43fb90dd2932459f962eb532d8dfb6ba53`
- `7z.dll` SHA-256: `899cd73d7fc60e1c1c35c7de0f5bed3dc69bfe2cecbd48014d868a347970a0b1`

See `License.txt` for the GNU LGPL, BSD and unRAR license notices. The RAR decoder is based on unRAR source code, which may not be used to develop a RAR (WinRAR) compatible archiver. `readme.txt` is supplied from the same distribution. The binaries and these notices are copied to `resources/7zip` beside the packaged application, outside `app.asar`.
