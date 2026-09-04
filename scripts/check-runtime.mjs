import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const requiredFiles = ["yt-dlp.exe", "ffmpeg.exe", "ffprobe.exe"];
const missingFiles = requiredFiles.filter((fileName) => {
  const filePath = join("runtime", fileName);
  return !existsSync(filePath) || statSync(filePath).size === 0;
});

if (missingFiles.length > 0) {
  console.error(`Missing runtime files: ${missingFiles.join(", ")}`);
  console.error("Place yt-dlp.exe, ffmpeg.exe, and ffprobe.exe in runtime before packaging.");
  process.exit(1);
}

console.log("Runtime files are ready:", requiredFiles.join(", "));