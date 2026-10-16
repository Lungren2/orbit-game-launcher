const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");

const inside = (base, target) => {
  const rel = path.relative(base, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};
const safeName = (value) => {
  let name =
    String(value)
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .slice(0, 120)
      .replace(/[. ]+$/g, "") || "Game";
  if (
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ||
    /^\.orbit-/i.test(name)
  )
    name = "_" + name;
  return name;
};
const sevenZip = () =>
  process.resourcesPath && __dirname.includes("app.asar")
    ? path.join(process.resourcesPath, "7zip/7za.exe")
    : path.join(__dirname, "../vendor/7zip/7za.exe");

function run7zip(args, timeout = 15 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(sevenZip(), args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "",
      stderr = "",
      failure;
    const timer = setTimeout(() => {
      failure = new Error("Archive processing timed out.");
      child.kill();
    }, timeout);
    child.stdin.end();
    child.stdout.on("data", (data) => {
      stdout += data.toString("utf8");
      if (stdout.length > 32 * 1024 * 1024) {
        failure = new Error("Archive listing is too large.");
        child.kill();
      }
    });
    child.stderr.on("data", (data) => {
      if (stderr.length < 32000) stderr += data.toString("utf8");
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(
          new Error(
            /password|encrypted/i.test(stderr + stdout)
              ? "This archive requires a password or is encrypted. Extract it manually."
              : "The archive is damaged, incomplete, or unsupported.",
          ),
        );
      else resolve(stdout);
    });
  });
}

function validateListing(listing, available = Number.MAX_SAFE_INTEGER) {
  const records = listing
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .filter((block) => /^Path = /m.test(block))
    .map((block) => {
      const record = {};
      for (const line of block.split('\n').filter(line => line.trim())) {
        const i = line.indexOf(' = ');
        const key = line.slice(0, i);
        if (i < 1 || !/^[A-Za-z][A-Za-z0-9 ]*$/.test(key) || Object.hasOwn(record, key)) throw new Error('Archive contains ambiguous file metadata.');
        record[key] = line.slice(i + 3);
      }
      return record;
    });
  if (!records.length || records.length > 200000)
    throw new Error("Archive is empty or has too many entries.");
  let total = 0;
  const paths = new Map();
  for (const record of records) {
    const name = record.Path;
    const parts = name.replace(/\\/g, "/").split("/");
    if (
      !name ||
      name.length > 1000 ||
      /^[\\/]/.test(name) ||
      /[:\x00-\x1f]/.test(name) ||
      parts.some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[. ]$/.test(p) ||
          /^\.orbit-/i.test(p) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
      )
    )
      throw new Error("Archive contains an unsafe file path.");
    if (
      Object.keys(record).some((key) =>
        /symbolic link|hard link|reparse|alternate stream/i.test(key),
      ) ||
      /(^|\s)l[rwx-]|^[^ ]*L/i.test(record.Attributes || "")
    )
      throw new Error(
        "Archives containing links are not imported automatically.",
      );
    if (record.Encrypted === "+")
      throw new Error("This archive requires a password. Extract it manually.");
    const size = Number(record.Size || 0);
    if (!Number.isSafeInteger(size) || size < 0)
      throw new Error("Archive contains invalid file sizes.");
    total += size;
    if (total > Math.min(500 * 1024 ** 3, available))
      throw new Error(
        "There is not enough free disk space to extract this archive.",
      );
    const normalized = parts.join("/").toLowerCase();
    if (paths.has(normalized))
      throw new Error("Archive contains duplicate file paths.");
    paths.set(
      normalized,
      record.Folder === "+" ||
        /D/.test((record.Attributes || "").split(" ")[0]),
    );
  }
  for (const name of paths.keys()) {
    const parts = name.split("/");
    parts.pop();
    while (parts.length) {
      if (paths.get(parts.join("/")) === false)
        throw new Error("Archive has conflicting file and directory paths.");
      parts.pop();
    }
  }
  return { total, entries: records.length };
}

async function verifyTree(root) {
  const base = await fs.realpath(root);
  let count = 0;
  async function walk(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (++count > 200000)
        throw new Error("Extracted archive has too many entries.");
      const target = path.join(folder, entry.name);
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink() || !inside(base, await fs.realpath(target)))
        throw new Error(
          "Extracted archive contains a link outside its folder.",
        );
      if (stat.isDirectory()) await walk(target);
      else if (!stat.isFile())
        throw new Error("Extracted archive contains an unsupported entry.");
    }
  }
  await walk(base);
}

async function cacheImage(url, destination) {
  try {
    const source = new URL(url);
    if (
      source.protocol !== "https:" ||
      !source.hostname.endsWith(".steamstatic.com")
    )
      return false;
    const response = await fetch(source, {
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (
      !response.ok ||
      !/^image\/(jpeg|png|webp)/.test(
        response.headers.get("content-type") || "",
      )
    )
      return false;
    const buffers = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 6 * 1024 * 1024) return false;
      buffers.push(chunk);
    }
    await fs.writeFile(destination, Buffer.concat(buffers));
    return true;
  } catch {
    return false;
  }
}

async function removePrivate(directory, base) {
  const resolvedBase = await fs.realpath(base);
  const resolved = await fs.realpath(directory);
  if (
    !inside(resolvedBase, resolved) ||
    (await fs.lstat(directory)).isSymbolicLink()
  )
    throw new Error("Invalid staging directory.");
  await fs.rm(resolved, { recursive: true, force: true });
}

async function importArchive({
  archive,
  root,
  game,
  onState = () => {},
  artwork = true,
}) {
  const resolvedRoot = await fs.realpath(root);
  const staging = path.join(resolvedRoot, ".orbit-staging");
  await fs.mkdir(staging, { recursive: true });
  if ((await fs.lstat(staging)).isSymbolicLink())
    throw new Error("Staging folder must not be a link.");
  const work = await fs.mkdtemp(path.join(staging, "extract-"));
  const extracted = path.join(work, "files");
  await fs.mkdir(extracted);
  let destination;
  try {
    const handle = await fs.open(archive, "r");
    const signature = Buffer.alloc(6);
    try {
      await handle.read(signature, 0, 6, 0);
    } finally {
      await handle.close();
    }
    if (
      !signature.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) &&
      !signature.equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))
    )
      throw new Error(
        "Only complete ZIP and 7z game archives can be imported automatically.",
      );
    onState("extracting");
    const disk = await fs.statfs(resolvedRoot);
    const available =
      Number(disk.bavail) * Number(disk.bsize) - 256 * 1024 ** 2;
    validateListing(
      await run7zip(
        ["l", "-slt", "-ba", "-sccUTF-8", "-p-", "--", archive],
        60000,
      ),
      available,
    );
    await run7zip([
      "x",
      "-y",
      "-sccUTF-8",
      "-p-",
      `-o${extracted}`,
      "--",
      archive,
    ]);
    await verifyTree(extracted);
    onState("importing");
    const base = safeName(game.name);
    for (let i = 0; i < 10000; i++) {
      const target = path.join(resolvedRoot, i ? `${base} (${i + 1})` : base);
      try {
        await fs.mkdir(target);
        destination = target;
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    if (!destination) throw new Error("Could not allocate a game folder.");
    await fs.writeFile(
      path.join(destination, ".orbit-installing"),
      randomUUID(),
    );
    // Preserve archive structure; executables can live under a single wrapper directory.
    for (const entry of await fs.readdir(extracted)) {
      const from = path.join(extracted, entry),
        to = path.join(destination, entry);
      try {
        await fs.rename(from, to);
      } catch (error) {
        if (!["EPERM", "EXDEV", "EACCES"].includes(error.code)) throw error;
        await fs.cp(from, to, {
          recursive: true,
          errorOnExist: true,
          force: false,
        });
      }
    }
    const assets = path.join(destination, ".orbit-assets");
    await fs.mkdir(assets);
    const steamAppId =
      Number.isSafeInteger(game.steamAppId) && game.steamAppId > 0
        ? game.steamAppId
        : null;
    const heroUrl = steamAppId
      ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`
      : null;
    const [hasCover, hasHero] = artwork
      ? await Promise.all([
          cacheImage(game.coverUrl, path.join(assets, "cover")),
          cacheImage(heroUrl, path.join(assets, "hero")),
        ])
      : [false, false];
    const manifest = {
      version: 1,
      name: game.name,
      playzipId: game.id,
      steamAppId,
      coverUrl: game.coverUrl || null,
      heroUrl,
      hasCover,
      hasHero,
      genre: game.genre || "PC game",
      importedAt: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(destination, ".orbit-game.json"),
      JSON.stringify(manifest, null, 2),
    );
    await fs.unlink(path.join(destination, ".orbit-installing"));
    return { folder: destination, manifest };
  } catch (error) {
    if (destination) error.message += ` Files are retained in ${destination}.`;
    throw error;
  } finally {
    await removePrivate(work, staging).catch(() => {});
  }
}
module.exports = {
  importArchive,
  validateListing,
  verifyTree,
  safeName,
  inside,
  sevenZip,
  run7zip,
  removePrivate,
};
