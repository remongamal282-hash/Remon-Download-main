# Remon Download

برنامج لتنزيل وإدارة الفيديوهات والملفات الإعلامية بطريقة منظمة وسهلة.

## Requirements

- Node.js 20 LTS or 22 LTS

## Commands

```bash
npm install
npm run dev
npm run build
```

## Windows Packaging (Phase 3.5)

The official Windows distribution is the NSIS installer:

```text
release/Remon-Download-Setup-<version>.exe
```

The Portable build is optional and intended for quick testing. The installer bundles `yt-dlp.exe`, `ffmpeg.exe`, and `ffprobe.exe` under `resources/runtime` outside `app.asar`. User data remains under Electron `userData` and is not removed by the installer.

## Project Docs

- [AI Handoff](docs/AI_HANDOFF.md)
- [Development Status](docs/DEVELOPMENT_STATUS.md)
