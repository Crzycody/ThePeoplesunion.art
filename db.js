const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'union.db');
const db = new sqlite3.Database(DB_PATH);

// Initialize tables
function initDb() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);

      db.run(`
        CREATE TABLE IF NOT EXISTS pledges (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          member_number INTEGER UNIQUE,
          alias TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT,
          state TEXT,
          tier INTEGER DEFAULT 1,
          sms_opt_in INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          notes TEXT
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          member_number INTEGER UNIQUE,
          alias TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          phone TEXT,
          state TEXT,
          chapter TEXT,
          role TEXT DEFAULT 'Member',
          is_verified INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS demands (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL,
          votes INTEGER DEFAULT 0
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS community_posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          author_alias TEXT NOT NULL,
          author_chapter TEXT NOT NULL,
          author_tier INTEGER DEFAULT 2,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          upvotes INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Seed metadata
      db.get(`SELECT value FROM meta WHERE key = 'base_count'`, (err, row) => {
        if (!row) {
          db.run(`INSERT INTO meta (key, value) VALUES ('base_count', '1428914')`);
          db.run(`INSERT INTO meta (key, value) VALUES ('target_count', '30000000')`);
        }
      });

      // Seed demands
      db.get(`SELECT COUNT(*) as count FROM demands`, (err, row) => {
        if (row && row.count === 0) {
          const coreDemands = [
            { id: 1, title: "Federal Living Wage Indexed to Inflation", category: "Economic", description: "Mandate a base federal living wage tied automatically to the real Consumer Price Index and regional cost-of-living adjustments.", votes: 1245800 },
            { id: 2, title: "Universal Healthcare (Medicare for All)", category: "Health & Human Rights", description: "Completely sever healthcare from employer control. Guaranteed medical, dental, vision, and mental health coverage for every resident.", votes: 1398200 },
            { id: 3, title: "32-Hour / 4-Day Workweek with No Loss in Pay", category: "Labor Standards", description: "Recognize that worker productivity has quadrupled. Overtime threshold lowered to 32 hours to restore work-life balance and health.", votes: 1184900 },
            { id: 4, title: "National Rent Cap & Ban on Wall Street Residential Landlords", category: "Housing", description: "Cap annual residential rent increases at 3% and ban hedge funds and private equity firms from purchasing single-family housing.", votes: 1312400 },
            { id: 5, title: "Total Ban on Corporate Political Spending & Stock Trading for Congress", category: "Democracy", description: "End Citizens United through constitutional amendment and immediately bar all sitting lawmakers and their families from trading individual stocks.", votes: 1410200 }
          ];
          const stmt = db.prepare(`INSERT INTO demands (id, title, category, description, votes) VALUES (?, ?, ?, ?, ?)`);
          coreDemands.forEach(d => stmt.run(d.id, d.title, d.category, d.description, d.votes));
          stmt.finalize();
        }
      });

      // Seed community posts
      db.get(`SELECT COUNT(*) as count FROM community_posts`, (err, row) => {
        if (row && row.count === 0) {
          const initialPosts = [
            { author_alias: "Ironworker_Dave", author_chapter: "Midwest Chapter - Chicago, IL", author_tier: 2, category: "Field Organizing", title: "Printed 500 QR Code stickers for local transit stops — results & tips", content: "Hey comrades, yesterday we set up a table near the Red Line station with the live counter on a tablet. People were shocked to see the counter tick up right in front of them when they scanned. We had over 180 pledges in 3 hours. People are ready.", upvotes: 428 },
            { author_alias: "NurseElena_RN", author_chapter: "Pacific Northwest - Seattle, WA", author_tier: 2, category: "Mutual Aid", title: "Setting up regional strike emergency food & insulin mutual aid banks", content: "When 30 million people withhold labor, we must protect our most vulnerable. Our healthcare worker caucus is drafting the emergency healthcare strike protocol to ensure urgent triage is maintained while economic leverage is maximized.", upvotes: 612 },
            { author_alias: "AnonymousOrganizer_KC", author_chapter: "Heartland Chapter - Kansas City, MO", author_tier: 2, category: "Security & Legal", title: "Why Tier 1 anonymity protects the frontlines from employer retaliation", content: "A quick reminder to all field captains: when handing out QR codes, emphasize to workers that Tier 1 requires only a first name or alias. Their employer cannot subpoena a decentralized movement with zero public doxxing vectors.", upvotes: 389 },
            { author_alias: "LogisticsDriver_09", author_chapter: "Inland Empire - Ontario, CA", author_tier: 2, category: "Direct Action", title: "Freight and logistics caucuses coordinating cross-state communication", content: "Supply chain workers are the spine of the economy. If the top 5 freight hubs pause simultaneously, the leverage is absolute. Keep spreading the QR cards at truck stops and fulfillment centers.", upvotes: 554 }
          ];
          const stmt = db.prepare(`INSERT INTO community_posts (author_alias, author_chapter, author_tier, category, title, content, upvotes) VALUES (?, ?, ?, ?, ?, ?, ?)`);
          initialPosts.forEach(p => stmt.run(p.author_alias, p.author_chapter, p.author_tier, p.category, p.title, p.content, p.upvotes));
          stmt.finalize();
        }
      });

      // Resolve only after all serialized seed operations above have completed
      db.run(`SELECT 1`, () => resolve());
    });
  });
}

function getStats() {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as live_pledges FROM pledges`, (err, pledgeRow) => {
      if (err) return reject(err);
      db.get(`SELECT value FROM meta WHERE key = 'base_count'`, (err, baseRow) => {
        if (err) return reject(err);
        const baseCount = parseInt(baseRow ? baseRow.value : '1428914', 10);
        const livePledges = pledgeRow ? pledgeRow.live_pledges : 0;
        const totalCount = baseCount + livePledges;
        const percent = ((totalCount / 30000000) * 100).toFixed(4);

        db.all(`SELECT state, COUNT(*) as count FROM pledges WHERE state IS NOT NULL AND state != '' GROUP BY state ORDER BY count DESC LIMIT 10`, (err, stateRows) => {
          if (err) return reject(err);
          db.all(`SELECT member_number, alias, state, tier, created_at FROM pledges ORDER BY id DESC LIMIT 8`, (err, recentRows) => {
            if (err) return reject(err);
            resolve({
              total_pledges: totalCount,
              live_new_pledges: livePledges,
              target_count: 30000000,
              percent_to_strike: percent,
              recent_pledges: recentRows || [],
              top_states: stateRows || []
            });
          });
        });
      });
    });
  });
}

function addPledge({ alias, email, phone, state, tier = 1, sms_opt_in = 1, notes = '' }) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT value FROM meta WHERE key = 'base_count'`, (err, baseRow) => {
      if (err) return reject(err);
      const baseCount = parseInt(baseRow ? baseRow.value : '1428914', 10);
      db.get(`SELECT MAX(member_number) as maxNum FROM pledges`, (err, maxRow) => {
        if (err) return reject(err);
        const nextMemberNumber = Math.max(baseCount, maxRow && maxRow.maxNum ? maxRow.maxNum : 0) + 1;
        const cleanAlias = (alias && alias.trim()) ? alias.trim() : `Worker #${nextMemberNumber.toString().slice(-4)}`;
        const cleanEmail = (email && email.trim()) ? email.trim() : `anonymous_${nextMemberNumber}@peoplesunion.local`;

        db.run(
          `INSERT INTO pledges (member_number, alias, email, phone, state, tier, sms_opt_in, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [nextMemberNumber, cleanAlias, cleanEmail, phone || null, state ? state.trim().toUpperCase() : 'US', tier, sms_opt_in ? 1 : 0, notes],
          function (err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, member_number: nextMemberNumber, alias: cleanAlias, email: cleanEmail, state: state || 'US', tier });
          }
        );
      });
    });
  });
}

function registerTier2({ alias, email, phone, state, chapter }) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT id FROM users WHERE email = ?`, [email], async (err, existing) => {
      if (err) return reject(err);
      if (existing) return reject(new Error('Email already registered.'));
      try {
        const pledge = await addPledge({ alias, email, phone, state, tier: 2, notes: `Verified Chapter: ${chapter || 'General'}` });
        const resolvedChapter = chapter || `${pledge.state} Solidarity Chapter`;
        db.run(
          `INSERT INTO users (member_number, alias, email, phone, state, chapter, role, is_verified) VALUES (?, ?, ?, ?, ?, ?, 'Verified Organizer', 1)`,
          [pledge.member_number, pledge.alias, pledge.email, pledge.phone, pledge.state, resolvedChapter],
          function (err) {
            if (err) return reject(err);
            resolve({ ...pledge, chapter: resolvedChapter, role: 'Verified Organizer' });
          }
        );
      } catch (e) { reject(e); }
    });
  });
}

function getDemands() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM demands ORDER BY id ASC`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function voteDemand(demandId) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE demands SET votes = votes + 1 WHERE id = ?`, [demandId], function (err) {
      if (err) return reject(err);
      db.get(`SELECT * FROM demands WHERE id = ?`, [demandId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  });
}

function getCommunityPosts() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM community_posts ORDER BY id DESC LIMIT 50`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function addCommunityPost({ author_alias, author_chapter, category, title, content, author_tier = 2 }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO community_posts (author_alias, author_chapter, author_tier, category, title, content, upvotes) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [author_alias, author_chapter, author_tier, category, title, content],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, author_alias, author_chapter, author_tier, category, title, content, upvotes: 1, created_at: new Date().toISOString() });
      }
    );
  });
}

function upvotePost(postId) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE community_posts SET upvotes = upvotes + 1 WHERE id = ?`, [postId], function (err) {
      if (err) return reject(err);
      db.get(`SELECT * FROM community_posts WHERE id = ?`, [postId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  });
}

function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM users WHERE email = ? AND is_verified = 1`, [email], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

module.exports = { db, initDb, getStats, addPledge, registerTier2, getDemands, voteDemand, getCommunityPosts, addCommunityPost, upvotePost, getUserByEmail };

