# GitHub File Uploader

Upload PDFs or any files straight into a GitHub folder, list them, and download with one click. Uses a GitHub Personal Access Token (PAT) via the GitHub Contents API. No backend, no build step.

## Run

Option 1 — just open it:
```
double-click index.html
```

Option 2 — serve locally (avoids some browser file:// quirks):
```powershell
cd D:\Coco-files
python -m http.server 8000
# then open http://localhost:8000
```

## Setup

1. Create a token: https://github.com/settings/tokens
   - Classic: scope `repo` (for private repos) or `public_repo` (public only)
   - Fine-grained: Repository access → your repo, Permissions → Contents: Read and write
2. In the app fill in:
   - Token, Owner, Repo, Branch (e.g. `main`), Folder (e.g. `uploads`)
3. Click **Test Connection & Load Files**
4. Drag & drop files or pick them → they are `PUT` to `/{folder}/{filename}` on that branch
5. Click **Download** next to any file to save it back to your computer

## Notes

- Max ~90–100 MB per file via Contents API (base64). For larger files use Git LFS / Releases.
- Uploading a file with the same name overwrites it (with proper `sha` handling).
- Token is stored only in your browser `localStorage` if "Remember" is checked, and only sent to `api.github.com`. For shared computers, uncheck it.
