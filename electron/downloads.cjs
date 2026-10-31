const fs = require("node:fs/promises");
const sync = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const { importArchive, safeName } = require("./importer.cjs");
const { scanLibrary } = require("./library.cjs");
const { incompleteInstall } = require('./removal.cjs');

function validateGame(game, origin = "https://playzip.com") {
  if (
    !game ||
    !/^\d+$/.test(String(game.id)) ||
    typeof game.name !== "string" ||
    !game.name.trim() ||
    game.name.length > 250 ||
    game.url !== `${origin}/game/${game.id}`
  )
    throw new Error("Invalid catalogue game.");
  let coverUrl = null,
    steamAppId = null;
  try {
    const cover = new URL(game.coverUrl);
    if (
      cover.protocol === "https:" &&
      cover.hostname.endsWith(".steamstatic.com")
    ) {
      coverUrl = cover.href;
      steamAppId =
        Number(/\/steam\/apps\/(\d+)\//.exec(cover.pathname)?.[1]) || null;
    }
  } catch {}
  return {
    id: String(game.id),
    name: game.name.trim(),
    url: game.url,
    coverUrl,
    steamAppId,
    genre: typeof game.genre === "string" ? game.genre.slice(0, 80) : "PC game",
  };
}

class DownloadManager extends EventEmitter {
  constructor({
    session,
    contents,
    getRoot,
    dataDirectory,
    origin = "https://playzip.com",
    importer = importArchive,
  }) {
    super();
    Object.assign(this, {
      session,
      contents,
      getRoot,
      dataDirectory,
      origin,
      importer,
    });
    this.jobs = [];
    this.items = new Map();
    this.requests = new Map();
    this.explicit = new Map();
    this.context = null;
    this.importTail = Promise.resolve();
    this.saving = Promise.resolve();
    this.saveTimer = null;
  }
  async initialize() {
    await fs.mkdir(this.dataDirectory, { recursive: true });
    try {
      this.jobs = JSON.parse(
        await fs.readFile(
          path.join(this.dataDirectory, "downloads.json"),
          "utf8",
        ),
      )
        .filter((job) => /^[a-f0-9-]{36}$/.test(job.id))
        .slice(-50);
      for (const job of this.jobs)
        if (
          [
            "downloading",
            "paused",
            "extracting",
            "importing",
            "queued",
          ].includes(job.status)
        ) {
          job.status = "interrupted";
          job.message = job.downloadComplete
            ? "Import interrupted. You can retry."
            : "Download interrupted when Orbit closed. Start it again from PlayZip.";
        }
    } catch {
      this.jobs = [];
    }
    this.session.webRequest.onBeforeRequest((details, callback) => {
      const context = this.context;
      const frame = details.frame;
      if (
        context &&
        details.webContentsId === this.contents.id &&
        frame?.parent === this.contents.mainFrame &&
        this.matches(frame.url, context.game.id)
      ) {
        this.requests.set(details.url, { context, time: Date.now() });
        if (this.requests.size > 300)
          this.requests.delete(this.requests.keys().next().value);
      }
      callback({});
    });
    this.session.on("will-download", (event, item, contents) =>
      this.capture(event, item, contents),
    );
  }
  matches(url, id) {
    try {
      const parsed = new URL(url);
      return (
        parsed.origin === this.origin &&
        new RegExp(`^/(game|download)/${id}/?$`).test(parsed.pathname)
      );
    } catch {
      return false;
    }
  }
  async prepare(game) {
    const validated = validateGame(game, this.origin);
    const root = await fs.realpath(this.getRoot());
    const staging = path.join(root, ".orbit-staging");
    await fs.mkdir(staging, { recursive: true });
    if ((await fs.lstat(staging)).isSymbolicLink())
      throw new Error("Staging folder must not be a link.");
    this.context = { token: randomUUID(), game: validated, root };
    return this.context.token;
  }
  clear(token) {
    if (this.context?.token === token) {
      this.context = null;
    }
  }
  popup(details) {
    const context = this.context;
    if (!context) return false;
    try {
      const ref = new URL(details.referrer.url);
      const url = new URL(details.url);
      const source = this.contents.mainFrame.frames?.find(
        (frame) =>
          frame.parent === this.contents.mainFrame &&
          this.matches(frame.url, context.game.id) &&
          new URL(frame.url).pathname.startsWith("/download/"),
      );
      // Cross-origin popups normally expose only the origin in their referrer.
      // Confirm the selected game's live, direct child frame as well.
      if (
        !source ||
        ref.origin !== this.origin ||
        (ref.pathname !== "/" && !this.matches(ref.href, context.game.id)) ||
        url.protocol !== "https:" ||
        url.username ||
        url.password
      )
        return false;
      // Only download responses are accepted by capture(). No popup is opened.
      this.explicit.set(url.href, { context, time: Date.now() });
      if (this.explicit.size > 50)
        this.explicit.delete(this.explicit.keys().next().value);
      this.contents.downloadURL(url.href);
      return true;
    } catch {
      return false;
    }
  }
  snapshot() {
    return this.jobs.map(({ ...job }) => ({
      ...job,
      resumable: !!this.items.get(job.id)?.canResume(),
      live: this.items.has(job.id),
    }));
  }
  changed() {
    this.emit("change", this.snapshot());
    if (!this.saveTimer)
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.persist().catch((error) => this.emit("storage-error", error));
      }, 300);
  }
  persist() {
    const data = JSON.stringify(this.jobs, null, 2);
    this.saving = this.saving
      .catch(() => {})
      .then(async () => {
        const file = path.join(this.dataDirectory, "downloads.json");
        await fs.writeFile(file + ".tmp", data);
        await fs.rename(file + ".tmp", file);
      });
    return this.saving;
  }
  newJob(game, root, filename) {
    const job = {
      id: randomUUID(),
      game: { ...game },
      root,
      filename: safeName(filename),
      status: "downloading",
      received: 0,
      total: 0,
      createdAt: new Date().toISOString(),
      downloadComplete: false,
      message: "",
    };
    job.archive = path.join(root, ".orbit-staging", job.id, job.filename);
    this.jobs.push(job);
    // Keep active jobs even when the history grows.
    if (this.jobs.length > 50) {
      const first = this.jobs.findIndex((j) =>
        ["ready", "needs-executable", "cancelled", "failed"].includes(j.status),
      );
      if (first >= 0) this.jobs.splice(first, 1);
    }
    return job;
  }
  capture(event, item, contents) {
    const urls = item.getURLChain();
    const pending = urls
      .map((url) => this.explicit.get(url) || this.requests.get(url))
      .find((entry) => entry && Date.now() - entry.time < 120000);
    if (contents !== this.contents || !pending) {
      event.preventDefault();
      return;
    }
    urls.forEach((url) => {
      this.explicit.delete(url);
      this.requests.delete(url);
    });
    const filename = item.getFilename();
    if (
      !/\.(zip|7z)$/i.test(filename) ||
      /\.part\d+\.|\.\d{3}$/i.test(filename)
    ) {
      event.preventDefault();
      const job = this.newJob(
        pending.context.game,
        pending.context.root,
        filename,
      );
      job.status = "needs-attention";
      job.message =
        "Only single ZIP and 7z archives are imported. Download installers or multipart files in your browser.";
      this.changed();
      return;
    }
    if (
      this.jobs.some(
        (job) =>
          job.game.id === pending.context.game.id &&
          [
            "downloading",
            "paused",
            "queued",
            "extracting",
            "importing",
          ].includes(job.status),
      )
    ) {
      event.preventDefault();
      return;
    }
    const job = this.newJob(
      pending.context.game,
      pending.context.root,
      filename,
    );
    try {
      const folder = path.dirname(job.archive);
      sync.mkdirSync(folder, { recursive: false });
      item.setSavePath(job.archive);
    } catch (error) {
      event.preventDefault();
      job.status = "failed";
      job.message = error.message;
      this.changed();
      return;
    }
    this.items.set(job.id, item);
    job.total = item.getTotalBytes();
    this.changed();
    item.on("updated", (_, state) => {
      job.received = item.getReceivedBytes();
      job.total = item.getTotalBytes();
      job.status =
        state === "interrupted"
          ? "interrupted"
          : item.isPaused()
            ? "paused"
            : "downloading";
      this.changed();
    });
    item.once("done", (_, state) => {
      this.items.delete(job.id);
      if (job.status === 'cancelled') { this.changed(); return; }
      job.received = item.getReceivedBytes();
      if (state === "completed") {
        job.downloadComplete = true;
        this.enqueue(job);
      } else {
        job.status = state === "cancelled" ? "cancelled" : "interrupted";
        job.message =
          state === "cancelled"
            ? "Download cancelled."
            : "Download interrupted. Start it again from PlayZip.";
        this.changed();
      }
    });
  }
  enqueue(job) {
    job.status = "queued";
    job.message = "";
    this.changed();
    this.importTail = this.importTail
      .catch(() => {})
      .then(async () => {
        if (job.status === "cancelled" || !this.jobs.includes(job) || this.stopping) return;
        this.activeImport = job.id;
        try {
          // Make completion and job metadata durable before HatchZip can consume
          // the staged archive, even for downloads that finish within 300 ms.
          await this.persist();
          if (this.stopping || job.status === "cancelled" || !this.jobs.includes(job)) return;
          const result = await this.importer({
            archive: job.archive,
            root: job.root,
            game: job.game,
            spaceSaving: true,
            onState: (state) => {
              job.status = state;
              this.changed();
            },
          });
          job.folder = result.folder;
          job.extractionEngine = result.extractionEngine || '7zip';
          const game = (await scanLibrary(job.root)).games.find(
            (game) => game.folder === result.folder,
          );
          job.gameId = game?.id;
          job.status =
            !game?.executable || game.needsChoice
              ? "needs-executable"
              : "ready";
          job.message =
            job.status === "needs-executable"
              ? "Choose the executable to finish setup."
              : "";
          this.emit("imported", { ...job });
        } catch (error) {
          job.status = this.stopping ? "interrupted" : "failed";
          job.message = this.stopping ? "Installation paused when Orbit closed. Retry installation to resume." : error.message;
        } finally { this.activeImport = null; }
        this.changed();
        await this.persist();
      });
    return this.importTail;
  }
  async addArchive(archive, game) {
    const root = await fs.realpath(this.getRoot());
    const base = path.join(root, ".orbit-staging");
    await fs.mkdir(base, { recursive: true });
    if ((await fs.lstat(base)).isSymbolicLink())
      throw new Error("Staging folder must not be a link.");
    const metadata = game
      ? validateGame(game, this.origin)
      : {
          id: "local",
          name: path.basename(archive).replace(/\.(zip|7z)$/i, ""),
          coverUrl: null,
          genre: "PC game",
        };
    const job = this.newJob(metadata, root, path.basename(archive));
    try {
      await fs.mkdir(path.dirname(job.archive));
      await fs.copyFile(archive, job.archive);
    } catch (error) {
      job.status = "failed";
      job.message = error.message;
      this.changed();
      throw error;
    }
    job.downloadComplete = true;
    job.received = job.total = (await fs.stat(job.archive)).size;
    this.enqueue(job);
    return job.id;
  }
  async control(id, action) {
    const job = this.jobs.find((job) => job.id === id);
    if (!job) throw new Error("Download not found.");
    const item = this.items.get(id);
    if (action === 'delete') {
      if (this.activeImport === id || ['extracting', 'importing'].includes(job.status)) throw new Error('Wait for installation to finish before deleting its download.');
      const root = await fs.realpath(job.root);
      const base = path.join(root, '.orbit-staging');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.id) || path.resolve(path.dirname(job.archive)).toLowerCase() !== path.join(base, job.id).toLowerCase()) throw new Error('Invalid download directory.');
      const staging = await fs.lstat(base).catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (staging && (staging.isSymbolicLink() || (await fs.realpath(base)).toLowerCase() !== base.toLowerCase())) throw new Error('Invalid staging directory.');
      const directory = path.join(base, job.id);
      const entry = await fs.lstat(directory).catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (entry && (entry.isSymbolicLink() || (await fs.realpath(directory)).toLowerCase() !== directory.toLowerCase())) throw new Error('Invalid download directory.');
      const unfinished = entry && await incompleteInstall(job, directory);
      if (this.activeImport === id || ['extracting', 'importing'].includes(job.status)) throw new Error('Wait for installation to finish before deleting its download.');
      job.status = 'cancelled';
      const liveItem = this.items.get(id);
      if (liveItem) {
        const stopped = new Promise(resolve => liveItem.once('done', resolve));
        liveItem.cancel(); await stopped; this.items.delete(id);
      }
      if (unfinished) await fs.rm(unfinished, { recursive: true, force: true });
      if (entry) await fs.rm(directory, { recursive: true, force: true });
      this.jobs = this.jobs.filter(value => value !== job);
      this.changed(); await this.flush();
      return this.snapshot();
    }
    if (action === "pause" && item && job.status === "downloading") {
      item.pause();
      job.status = "paused";
    } else if (
      action === "resume" &&
      item &&
      ["paused", "interrupted"].includes(job.status)
    ) {
      if (!item.isPaused() && !item.canResume())
        throw new Error("This server cannot resume the download.");
      item.resume();
      job.status = "downloading";
    } else if (action === "cancel" && (item || job.status === "queued")) {
      if (item) item.cancel();
      job.status = "cancelled";
    } else if (
      action === "retry" &&
      job.downloadComplete &&
      ["failed", "interrupted"].includes(job.status)
    ) {
      const base = await fs.realpath(path.join(job.root, ".orbit-staging"));
      // HatchZip can consume the archive completely before metadata is published.
      // Its private transaction remains sufficient to finish a retry.
      const directory = await fs.realpath(path.dirname(job.archive));
      const archive = path.join(directory, path.basename(job.archive));
      if (
        !archive.startsWith(base + path.sep) ||
        path.dirname(archive) !== path.join(base, job.id)
      )
        throw new Error("Invalid archive path.");
      this.enqueue(job);
    } else throw new Error("That action is not available for this download.");
    this.changed();
    return this.snapshot();
  }
  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.persist();
  }
  async shutdown() {
    this.stopping = true;
    await require('./hatchzip.cjs').stopHatchzip();
    await this.importTail.catch(() => {});
    await this.flush();
  }
}
module.exports = { DownloadManager, validateGame };
