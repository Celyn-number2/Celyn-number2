import fs from "node:fs";
import path from "node:path";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USERNAME;
const output = process.argv[2];

if (!token || !username || !output) {
  throw new Error("GITHUB_TOKEN, GITHUB_USERNAME, and output path are required");
}

const end = new Date();
end.setUTCDate(end.getUTCDate() + 1);
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - 31);

const query = `
  query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "Celyn-number2-profile-readme",
  },
  body: JSON.stringify({
    query,
    variables: {
      login: username,
      from: start.toISOString(),
      to: end.toISOString(),
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub API returned ${response.status}`);
}

const payload = await response.json();
if (payload.errors?.length || !payload.data?.user) {
  throw new Error(payload.errors?.[0]?.message ?? `GitHub user ${username} was not found`);
}

const days = payload.data.user.contributionsCollection.contributionCalendar.weeks
  .flatMap((week) => week.contributionDays)
  .filter((day) => new Date(`${day.date}T00:00:00Z`) >= start)
  .slice(-31);

const width = 900;
const height = 280;
const left = 58;
const right = 26;
const top = 68;
const bottom = 58;
const chartWidth = width - left - right;
const chartHeight = height - top - bottom;
const baseline = top + chartHeight;
const max = Math.max(1, ...days.map((day) => day.contributionCount));
const total = days.reduce((sum, day) => sum + day.contributionCount, 0);
const x = (index) => left + (index * chartWidth) / Math.max(1, days.length - 1);
const y = (count) => baseline - (count / max) * chartHeight;
const points = days.map((day, index) => `${x(index).toFixed(1)},${y(day.contributionCount).toFixed(1)}`);
const area = `M ${left} ${baseline} L ${points.join(" L ")} L ${left + chartWidth} ${baseline} Z`;

const grid = Array.from({ length: 4 }, (_, index) => {
  const gridY = top + (index * chartHeight) / 3;
  const value = Math.round(max - (index * max) / 3);
  return `<line x1="${left}" y1="${gridY}" x2="${left + chartWidth}" y2="${gridY}" />\n<text x="${left - 12}" y="${gridY + 5}" text-anchor="end">${value}</text>`;
}).join("\n");

const labels = days
  .map((day, index) => ({ day, index }))
  .filter(({ index }) => index % 5 === 0 || index === days.length - 1)
  .map(({ day, index }) => {
    const label = new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    return `<text x="${x(index)}" y="${height - 24}" text-anchor="middle">${label}</text>`;
  })
  .join("\n");

const circles = days
  .map(
    (day, index) =>
      `<circle cx="${x(index)}" cy="${y(day.contributionCount)}" r="4"><title>${day.date}: ${day.contributionCount} contributions</title></circle>`,
  )
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="280" viewBox="0 0 900 280" role="img" aria-labelledby="title desc">
<title id="title">Celyn's GitHub activity</title>
<desc id="desc">Daily GitHub contributions over the last 31 days.</desc>
<rect width="900" height="280" rx="8" fill="#F0EEE6" />
<text x="32" y="38" fill="#D97757" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700">Celyn's GitHub Activity</text>
<text x="868" y="38" text-anchor="end" fill="#6B625B" font-family="Segoe UI, Arial, sans-serif" font-size="15">${total} contributions · last 31 days</text>
<g stroke="#D8D3C8" stroke-width="1" fill="#6B625B" font-family="Segoe UI, Arial, sans-serif" font-size="12">
${grid}
</g>
<path d="${area}" fill="#E3DACC" opacity="0.72" />
<polyline points="${points.join(" ")}" fill="none" stroke="#D97757" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
<g fill="#D97757" stroke="#F0EEE6" stroke-width="2">${circles}</g>
<g fill="#6B625B" font-family="Segoe UI, Arial, sans-serif" font-size="12">${labels}</g>
</svg>
`;

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, svg);
