const labels = {
  downloading: "Downloading",
  paused: "Paused",
  interrupted: "Interrupted",
  queued: "Waiting to import",
  extracting: "Extracting",
  importing: "Adding to library",
  ready: "Ready to play",
  "needs-executable": "Choose executable",
  "needs-attention": "Needs attention",
  cancelled: "Cancelled",
  failed: "Import failed",
};
const bytes = (value) => {
  if (!value) return "0 B";
  const unit = Math.min(3, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** unit).toFixed(unit ? 1 : 0)} ${["B", "KB", "MB", "GB"][unit]}`;
};

export function createDownloads({
  desktop,
  request,
  esc,
  icon,
  toast,
  viewLibrary,
}) {
  let jobs = [],
    target;
  function draw() {
    const count = jobs.filter((job) =>
      ["downloading", "paused", "queued", "extracting", "importing"].includes(
        job.status,
      ),
    ).length;
    const indicator = document.querySelector("#downloads-count");
    if (indicator) {
      indicator.textContent = count || "";
      indicator.hidden = !count;
    }
    if (!target?.isConnected || document.body.dataset.view !== "downloads")
      return;
    const focused = document.activeElement?.dataset.downloadAction;
    const focusedJob = document.activeElement?.dataset.jobId;
    target.innerHTML = `<section class="downloads-view"><div class="downloads-toolbar"><h1>Downloads</h1><button class="text-button" id="add-archive">${icon("folder")} Import archive</button></div>${
      !desktop
        ? '<div class="catalogue-message">Downloads are available in the desktop app.</div>'
        : !jobs.length
          ? '<div class="catalogue-message">Your downloads will appear here.</div>'
          : `<div class="download-list">${[...jobs]
              .reverse()
              .map((job) => {
                const percent = job.total
                  ? Math.min(100, Math.round((job.received / job.total) * 100))
                  : 0;
                const controls = [];
                if (job.status === "downloading" && job.live)
                  controls.push(["pause", "Pause"]);
                if (
                  (job.status === "paused" && job.live) ||
                  (job.status === "interrupted" && job.live && job.resumable)
                )
                  controls.push(["resume", "Resume"]);
                if (job.live || job.status === "queued")
                  controls.push(["cancel", "Cancel"]);
                if (
                  job.downloadComplete &&
                  ["failed", "interrupted"].includes(job.status)
                )
                  controls.push(["retry", "Retry import"]);
                if (job.status === "needs-executable")
                  controls.push(["executable", "Choose executable"]);
                if (job.status === "ready")
                  controls.push(["library", "View library"]);
                if (job.downloadComplete || job.folder)
                  controls.push(["folder", "Open folder"]);
                return `<article class="download-row"><div class="download-art">${job.game.coverUrl ? `<img src="${esc(job.game.coverUrl)}" alt="" referrerpolicy="no-referrer">` : icon("grid")}</div><div class="download-info"><h2>${esc(job.game.name)}</h2><div class="download-status">${esc(labels[job.status] || job.status)}${["downloading", "paused", "interrupted"].includes(job.status) ? `<span>${bytes(job.received)}${job.total ? ` / ${bytes(job.total)}` : ""}</span>` : ""}</div>${["downloading", "paused", "interrupted"].includes(job.status) ? `<progress max="100" ${job.total ? `value="${percent}"` : ""} aria-label="${esc(job.game.name)} download progress"></progress>` : ""}${job.message ? `<p class="download-message">${esc(job.message)}</p>` : ""}<div class="download-actions">${controls.map(([action, label]) => `<button data-download-action="${action}" data-job-id="${job.id}">${label}</button>`).join("")}</div></div></article>`;
              })
              .join("")}</div>`
    }</section>`;
    target.querySelector("#add-archive").onclick = () => addArchive();
    target.querySelectorAll("[data-download-action]").forEach(
      (button) =>
        (button.onclick = async () => {
          const id = button.dataset.jobId,
            action = button.dataset.downloadAction;
          button.disabled = true;
          try {
            if (action === "library") return viewLibrary();
            if (action === "folder") await request("downloadFolder", id);
            else if (action === "executable")
              await request("downloadExecutable", id);
            else jobs = await request("downloadControl", id, action);
          } catch (error) {
            toast(error.message);
          } finally {
            draw();
          }
        }),
    );
    if (focused && focusedJob)
      target
        .querySelector(
          `[data-download-action="${focused}"][data-job-id="${focusedJob}"]`,
        )
        ?.focus({ preventScroll: true });
  }
  async function addArchive(game) {
    if (!desktop) return toast("Available in the desktop app.");
    try {
      await request("addArchive", game || undefined);
    } catch (error) {
      toast(error.message);
    }
  }
  return {
    mount(element) {
      target = element;
      draw();
    },
    update(next) {
      jobs = next;
      draw();
    },
    addArchive,
  };
}
