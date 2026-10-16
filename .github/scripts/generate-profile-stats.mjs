import fs from "node:fs";
import path from "node:path";

const username = process.env.GITHUB_USERNAME;
const token = process.env.GITHUB_TOKEN;
const output = process.argv[2];
if (!username || !token || !output) throw new Error("GITHUB_USERNAME, GITHUB_TOKEN and output directory are required");
const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Celyn-profile-stats" };
async function api(route) {
  const response = await fetch(`https://api.github.com${route}`, { headers });
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
  return response.json();
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const user = await api(`/users/${encodeURIComponent(username)}`);
let repos = [];
for (let page = 1; ; page++) {
  const batch = await api(`/users/${encodeURIComponent(username)}/repos?type=owner&per_page=100&page=${page}`);
  repos.push(...batch.filter(r => !r.private));
  if (batch.length < 100) break;
}
const languages = new Map();
for (const repo of repos.filter(r => !r.fork)) {
  const values = await api(`/repos/${repo.full_name}/languages`);
  for (const [name, bytes] of Object.entries(values)) languages.set(name, (languages.get(name) ?? 0) + bytes);
}
const stamp = new Date().toISOString().slice(0, 10);
function card(title, subtitle, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="260" viewBox="0 0 480 260" role="img" aria-labelledby="title desc"><title id="title">${escape(title)}</title><desc id="desc">${escape(subtitle)}</desc><rect width="480" height="260" rx="8" fill="#F0EEE6"/><g font-family="Segoe UI, Arial, sans-serif"><text x="24" y="36" fill="#D97757" font-size="20" font-weight="700">${escape(title)}</text><text x="24" y="59" fill="#6B625B" font-size="11">${escape(subtitle)}</text>${body}<text x="24" y="242" fill="#6B625B" font-size="11">Updated ${stamp} UTC · GitHub public data</text></g></svg>`;
}
const metrics = [
  ["Public repositories", repos.length],
  ["Stars received", repos.reduce((n, r) => n + r.stargazers_count, 0)],
  ["Repository forks", repos.reduce((n, r) => n + r.forks_count, 0)],
  ["Followers", user.followers],
];
const stats = metrics.map(([label, count], index) => {
  const x = 24 + (index % 2) * 230;
  const y = 103 + Math.floor(index / 2) * 77;
  return `<text x="${x}" y="${y}" font-size="29" font-weight="700" fill="#141413">${count}</text><text x="${x}" y="${y + 22}" font-size="13" fill="#6B625B">${label}</text>`;
}).join("");
const ranked = [...languages.entries()].sort((a, b) => b[1] - a[1]);
const total = ranked.reduce((n, [, bytes]) => n + bytes, 0);
const colors = ["#D97757", "#B9654B", "#9B6C56", "#C98A70", "#7A4C3E", "#A99A85"];
const langBody = ranked.slice(0, 6).map(([name, bytes], index) => {
  const percent = bytes / total * 100;
  const y = 84 + index * 24;
  return `<circle cx="29" cy="${y - 4}" r="4" fill="${colors[index]}"/><text x="41" y="${y}" font-size="12" fill="#141413">${escape(name)}</text><rect x="180" y="${y - 10}" width="205" height="8" rx="4" fill="#E3DACC"/><rect x="180" y="${y - 10}" width="${(205 * percent / 100).toFixed(2)}" height="8" rx="4" fill="${colors[index]}"/><text x="452" y="${y}" text-anchor="end" font-size="12" fill="#6B625B">${percent.toFixed(1)}%</text>`;
}).join("") || '<text x="24" y="120" fill="#6B625B" font-size="14">No public language data yet</text>';
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "github-stats.svg"), card(`${username}'s GitHub Stats`, "Repositories owned by this account", stats));
fs.writeFileSync(path.join(output, "github-languages.svg"), card("Most Used Languages", "Top 6 · share of code bytes in public non-fork repositories", langBody));
console.log(`Generated stats for ${repos.length} public repositories and ${languages.size} languages`);
