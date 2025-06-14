const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const xml2js = require('xml2js');

// Pushover config from env
const pushoverAppToken = process.env.PUSHOVER_APP_TOKEN;
const pushoverUserKey = process.env.PUSHOVER_USER_KEY;

const notifiedFile = path.resolve('./notified.json');

// Load notified IDs from file or start fresh
let notified = {};
if (fs.existsSync(notifiedFile)) {
  try {
    notified = JSON.parse(fs.readFileSync(notifiedFile, 'utf8'));
  } catch {
    notified = {};
  }
}

// Define your feeds and filters here:
// Each feed is an object with `url` and `filters` (array of exact phrases)
const feeds = [
  {
    url: "https://www.whentostream.com/news?format=rss",
    filters: ["digital streaming"]
  },
  // {
  //   url: "https://feed2.com/rss",
  //   filters: ["another sentence", "taxis", "third sentence"]
  // },
  // {
  //   url: "https://feed3.com/rss",
  //   filters: [] // Left blank, it will notify for every entry
  // }
];

// Send notification to Pushover
async function sendPushoverNotification(title, url) {
  const params = new URLSearchParams();
  params.append('token', pushoverAppToken);
  params.append('user', pushoverUserKey);
  params.append('title', title);
  params.append('message', url);

  const res = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    body: params
  });

  if (!res.ok) {
    throw new Error(`Pushover error: ${res.status} ${await res.text()}`);
  }
}

async function checkFeed(feed) {
  console.log(`Checking feed: ${feed.url}`);
  try {
    const response = await fetch(feed.url);
    const xml = await response.text();
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xml);

    const items = result.rss.channel[0].item || [];
    let matchesFound = false;

    for (const item of items) {
      const title = item.title[0];
      const link = item.link[0];

      // Unique ID for the item, fallback to link if guid missing
      const id = item.guid ? item.guid[0]._ || item.guid[0] : link;

      // Skip if already notified
      if (notified[id]) continue;

      // Match if filters empty or any filter phrase is found in title (case-insensitive)
      const matched = feed.filters.length === 0 || feed.filters.some(phrase =>
        title.toLowerCase().includes(phrase.toLowerCase())
      );

      if (matched) {
        console.log(`Match found: "${title}"`);
        await sendPushoverNotification(title, link);
        notified[id] = true;
        matchesFound = true;
      }
    }

    if (!matchesFound) {
      console.log('No matches found in this feed.');
    }
  } catch (err) {
    console.error(`Error checking feed ${feed.url}:`, err.message);
  }
}

async function main() {
  for (const feed of feeds) {
    await checkFeed(feed);
  }

  // Save notified IDs back to file
  fs.writeFileSync(notifiedFile, JSON.stringify(notified, null, 2));
}

main();
