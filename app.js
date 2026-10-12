const $ = (id) => document.getElementById(id);
const statusEl = $("status");

function setStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = "status " + (ok === true ? "ok" : ok === false ? "err" : "");
}

function getConfig() {
  return {
    token: $("token").value.trim(),
    owner: $("owner").value.trim(),
    repo: $("repo").value.trim(),
    branch: $("branch").value.trim() || "main",
    folder: $("folder").value.trim().replace(/^\/+|\/+$/g, ""),
  };
}

function saveConfig() {
  if (!$("remember").checked) {
    localStorage.removeItem("gh-uploader");
    return;
  }
  const c = getConfig();
  localStorage.setItem("gh-uploader", JSON.stringify({ ...c, token: c.token }));
}

function loadConfig() {
  try {
    const c = JSON.parse(localStorage.getItem("gh-uploader") || "{}");
    if (c.token) $("token").value = c.token;
    if (c.owner) $("owner").value = c.owner;
    if (c.repo) $("repo").value = c.repo;
    if (c.branch) $("branch").value = c.branch;
    if (c.folder) $("folder").value = c.folder;
  } catch {}
}

async function api(path, token, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function fmtSize(b) {
  if (b == null) return "";
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / 1024 / 1024).toFixed(1) + " MB";
}

async function listFiles() {
  const { token, owner, repo, branch, folder } = getConfig();
  if (!token || !owner || !repo) throw new Error("Fill in token, owner and repo first.");
  const data = await api(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(folder)}?ref=${encodeURIComponent(branch)}`,
    token
  );
  const files = Array.isArray(data) ? data : [data];
  return files.filter((f) => f.type === "file");
}

async function renderFiles() {
  const { owner, repo, branch, folder } = getConfig();
  const ul = $("github-files");
  ul.innerHTML = "<li>Loading…</li>";
  $("repo-path").textContent = folder ? `— ${owner}/${repo}/${folder} @ ${branch}` : "";
  try {
    const files = await listFiles();
    saveConfig();
    if (!files.length) {
      ul.innerHTML = "<li>No files yet in this folder.</li>";
      setStatus("Connected. Folder is empty.", true);
      return;
    }
    ul.innerHTML = "";
    for (const f of files) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = f.name;
      name.title = f.path;
      const size = document.createElement("span");
      size.className = "size";
      size.textContent = fmtSize(f.size);
      const dl = document.createElement("button");
      dl.textContent = "Download";
      dl.onclick = () => downloadFile(f);
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.className = "secondary";
      del.onclick = () => deleteFile(f, li);
      li.append(name, size, dl, del);
      ul.appendChild(li);
    }
    setStatus(`Loaded ${files.length} file(s).`, true);
  } catch (e) {
    if (String(e.message).includes("404")) {
      ul.innerHTML = "<li>Folder not found yet — upload a file to create it.</li>";
      setStatus("Connected, but folder does not exist yet.", true);
    } else {
      ul.innerHTML = "";
      setStatus(e.message, false);
    }
  }
}

async function uploadFiles(fileList) {
  const { token, owner, repo, branch, folder } = getConfig();
  if (!token || !owner || !repo) {
    setStatus("Fill in token, owner and repo first.", false);
    return;
  }
  if (!fileList.length) return;
  const ul = $("upload-list");
  ul.innerHTML = "";
  saveConfig();

  for (const file of fileList) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="name"></span><span class="size"></span>`;
    li.querySelector(".name").textContent = file.name;
    li.querySelector(".size").textContent = fmtSize(file.size) + " — uploading…";
    ul.appendChild(li);

    try {
      if (file.size > 90 * 1024 * 1024) throw new Error("File too large for Contents API (>90MB). Use Git LFS instead.");
      const content = await toBase64(file);
      const path = folder ? `${folder}/${file.name}` : file.name;

      // Check if file exists to include sha (required for update)
      let sha;
      try {
        const existing = await api(
          `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
          token
        );
        sha = existing.sha;
      } catch {}

      await api(`/repos/${owner}/${repo}/contents/${path}`, token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Upload ${file.name} via file uploader`,
          content,
          branch,
          ...(sha ? { sha } : {}),
        }),
      });
      li.querySelector(".size").textContent = "Uploaded ✓";
      setStatus(`${file.name} pushed to ${path}.`, true);
    } catch (e) {
      li.querySelector(".size").textContent = "Failed: " + e.message.slice(0, 200);
      setStatus(e.message, false);
    }
  }
  renderFiles();
}

async function downloadFile(f) {
  setStatus(`Downloading ${f.name}…`);
  try {
    // download_url is public for public repos but needs auth for private — fetch with token
    const { token } = getConfig();
    const res = await fetch(f.download_url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setStatus(`${f.name} downloaded.`, true);
  } catch (e) {
    setStatus(e.message, false);
  }
}

async function deleteFile(f, li) {
  if (!confirm(`Delete ${f.name} from GitHub?`)) return;
  const { token, owner, repo, branch } = getConfig();
  try {
    await api(`/repos/${owner}/${repo}/contents/${f.path}`, token, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: `Delete ${f.name} via file uploader`, sha: f.sha, branch }),
    });
    li.remove();
    setStatus(`${f.name} deleted.`, true);
  } catch (e) {
    setStatus(e.message, false);
  }
}

// wiring
loadConfig();
$("btn-connect").onclick = renderFiles;
$("btn-refresh").onclick = renderFiles;
$("btn-upload").onclick = () => uploadFiles($("file-input").files);
$("file-input").onchange = (e) => uploadFiles(e.target.files);

const dz = $("dropzone");
["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); }));
["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); }));
dz.addEventListener("drop", (e) => uploadFiles(e.dataTransfer.files));
