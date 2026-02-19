/**
 * seed-extras.mjs
 * Seeds:
 *  1. A demo user (or reuses existing one)
 *  2. play_events  → powers getTrending → Recommendations section
 *  3. listening_progress → powers getHistory → Continue Listening section
 *
 * Run:  node seed-extras.mjs
 * The script prints the demo userId so you can pass it to the home endpoint:
 *   GET /api/v1/home?userId=<id>
 */

import { MongoClient, ObjectId } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/raawy';

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();

  // ── 1. Demo user ──────────────────────────────────────────────────────────
  const usersCol = db.collection('users');
  let demoUser = await usersCol.findOne({ email: 'demo@rawy.app' });
  if (!demoUser) {
    const res = await usersCol.insertOne({
      username: 'demo_user',
      email: 'demo@rawy.app',
      passwordHash: null,
      role: 'listener',
      avatarUrl: 'https://i.pravatar.cc/150?img=47',
      bio: 'Demo listener account',
      socialLinks: null,
      emailVerified: true,
      googleId: null,
      creatorProfile: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    demoUser = { _id: res.insertedId };
    console.log('✅ Created demo user:', res.insertedId.toString());
  } else {
    console.log('✅ Demo user already exists:', demoUser._id.toString());
  }
  const userId = demoUser._id;

  // ── 2. Fetch seeded podcasts + episodes ───────────────────────────────────
  const podcasts = await db.collection('podcasts').find({ status: 'published' }).toArray();
  const episodes = await db.collection('episodes').find({ status: 'published' }).toArray();

  if (!podcasts.length || !episodes.length) {
    console.error('❌ No podcasts/episodes found. Run seed.mjs first.');
    await client.close();
    process.exit(1);
  }

  console.log(`Found ${podcasts.length} podcasts, ${episodes.length} episodes`);

  // ── 3. play_events (for trending → recommendations) ───────────────────────
  const playEventsCol = db.collection('playevents');

  // Insert multiple play events per podcast to simulate trending popularity
  const playEventDocs = [];
  for (const podcast of podcasts) {
    const podcastEpisodes = episodes.filter(
      (e) => e.podcastId.toString() === podcast._id.toString()
    );
    const plays = Math.floor(Math.random() * 20) + 10; // 10–29 plays per podcast
    for (let i = 0; i < plays; i++) {
      const ep = podcastEpisodes[i % podcastEpisodes.length];
      playEventDocs.push({
        episodeId: ep._id,
        podcastId: podcast._id,
        userId: userId,
        listenedSeconds: Math.floor(Math.random() * 1200) + 60,
        deviceInfo: 'seed-script',
        geoCountry: 'EG',
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      });
    }
  }

  await playEventsCol.deleteMany({ deviceInfo: 'seed-script' }); // clean up old seed events
  const evRes = await playEventsCol.insertMany(playEventDocs);
  console.log(`✅ Inserted ${evRes.insertedCount} play events`);

  // ── 4. listening_progress (for continue listening) ────────────────────────
  const progressCol = db.collection('listeningprogresses');

  // Pick first 4 episodes across different podcasts
  const progressEpisodes = episodes.slice(0, 4);
  for (const ep of progressEpisodes) {
    const position = Math.floor((ep.duration ?? 1800) * (0.2 + Math.random() * 0.5));
    await progressCol.updateOne(
      { userId, episodeId: ep._id },
      {
        $set: {
          userId,
          episodeId: ep._id,
          positionSeconds: position,
          updatedAt: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000),
        },
      },
      { upsert: true }
    );
    console.log(
      `  ↳ Progress for "${ep.title}": ${Math.round(position / 60)}m`
    );
  }
  console.log('✅ Listening progress inserted');

  console.log('\n─────────────────────────────────────────────────────');
  console.log(`Demo userId: ${userId.toString()}`);
  console.log('Test the home endpoint with all sections:');
  console.log(`  GET http://localhost:3000/api/v1/home?userId=${userId.toString()}`);
  console.log('─────────────────────────────────────────────────────\n');

  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
