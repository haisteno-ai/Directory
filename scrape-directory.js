#!/usr/bin/env node
/**
 * scrape-directory.js
 * Fetches JSU People Finder A–Z, parses results, deduplicates,
 * and injects the updated DB array into index.html.
 *
 * Usage:  node scrape-directory.js [path/to/index.html]
 *         Defaults to ./index.html
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const TARGET = 'https://www.jsu.edu/people-finder/index.html';
const DELAY_MS = 500; // polite delay between requests

// ── Student account filter (mirrors the client-side isStu) ──
function isStu(email) {
  if (!email) return false;
  return email.toLowerCase().includes('.stu@');
}

// ── POST a search term and return raw HTML ──
function fetchSearch(term) {
  return new Promise((resolve, reject) => {
    const body = `searchterm=${encodeURIComponent(term)}&searchtype=all&Search=Search`;
    const url = new URL(TARGET);

    const opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'JAXFinder-Scraper/1.0 (JSU IT internal tool)',
      },
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode} for "${term}"`));
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Parse the JSU HTML into person objects (mirrors client parseJSU) ──
function parseJSU(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const content = doc.querySelector('.content.col12') || doc.body;
  if (!content || content.textContent.includes('Invalid Search Criteria')) return [];

  const blocks = content.innerHTML.split(/<hr\s*\/?>/i);
  const people = [];
  const seen = {};

  for (const block of blocks) {
    const bDom = new JSDOM(block);
    const b = bDom.window.document;
    const strong = b.querySelector('strong');
    if (!strong) continue;

    const name = strong.textContent.trim();
    if (!name || name.length < 2) continue;
    if (name.includes('Directory Update') || name.includes('Complete the')) continue;

    const emailTag = b.querySelector('a[href^="mailto:"]');
    const email = emailTag ? emailTag.getAttribute('href').replace('mailto:', '').trim() : '';

    if (isStu(email)) continue;

    const key = email ? email.toLowerCase() : name.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;

    // Walk siblings after <strong> to collect lines
    const lines = [];
    let node = strong.nextSibling;
    while (node) {
      let txt = '';
      if (node.nodeType === 3) {
        txt = node.textContent.trim();
      } else if (node.nodeType === 1) {
        if (node.tagName === 'A' && emailTag && node.getAttribute('href') === emailTag.getAttribute('href')) {
          node = node.nextSibling;
          continue;
        }
        txt = node.textContent.trim();
      }
      if (txt && txt !== name && txt !== email && !txt.includes('Directory Update')) {
        txt.split(/\n+/).forEach((l) => {
          l = l.trim();
          if (l && l !== name && l !== email) lines.push(l);
        });
      }
      node = node.nextSibling;
    }

    let phone = '', room = '', title = '', dept = '';
    const rem = [];
    for (const line of lines) {
      if (/^\d{3}-\d{3}-\d{4}$/.test(line)) phone = line;
      else if (/^\d+\s+\w/.test(line) || /\b(hall|complex|building|center|house|annex|lab|floor)\b/i.test(line)) room = line;
      else rem.push(line);
    }
    if (rem.length) title = rem[0];
    if (rem.length > 1) dept = rem[1];
    if (!title && !dept && !phone && !room && !email) continue;

    people.push({ name, title, department: dept, room, phone, email });
  }

  return people;
}

// ── Sleep helper ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ──
async function main() {
  const htmlPath = path.resolve(process.argv[2] || './index.html');
  console.log(`Target file: ${htmlPath}`);

  if (!fs.existsSync(htmlPath)) {
    console.error(`File not found: ${htmlPath}`);
    process.exit(1);
  }

  // Search A–Z plus a few common first-name letters / wildcards
  const queries = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const allPeople = {};
  let totalFetched = 0;

  for (const q of queries) {
    process.stdout.write(`Fetching "${q}"... `);
    try {
      const html = await fetchSearch(q);
      const people = parseJSU(html);
      let added = 0;
      for (const p of people) {
        const key = (p.email || p.name).toLowerCase();
        if (!allPeople[key]) {
          allPeople[key] = p;
          added++;
        }
      }
      console.log(`${people.length} results, ${added} new (${Object.keys(allPeople).length} total)`);
      totalFetched++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  const db = Object.values(allPeople).sort((a, b) => a.name.localeCompare(b.name));
  console.log(`\nTotal unique records: ${db.length} (from ${totalFetched} successful queries)`);

  if (db.length < 100) {
    console.error('ERROR: Got fewer than 100 records — something is wrong. Aborting to protect existing data.');
    process.exit(1);
  }

  // Read current file and replace the DB line
  let fileContent = fs.readFileSync(htmlPath, 'utf8');

  // Match the const DB=[...]; line — handles the massive single-line JSON array
  const dbRegex = /const DB=\[[\s\S]*?\];\s*/;
  if (!dbRegex.test(fileContent)) {
    console.error('ERROR: Could not find "const DB=[...];" in the file.');
    process.exit(1);
  }

  const newDbLine = `const DB=${JSON.stringify(db)};\n`;
  fileContent = fileContent.replace(dbRegex, newDbLine);

  fs.writeFileSync(htmlPath, fileContent, 'utf8');
  console.log(`Updated ${htmlPath} with ${db.length} records.`);

  // Also write a standalone JSON for reference / debugging
  const jsonPath = path.join(path.dirname(htmlPath), 'directory-db.json');
  fs.writeFileSync(jsonPath, JSON.stringify(db, null, 2), 'utf8');
  console.log(`Wrote ${jsonPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
