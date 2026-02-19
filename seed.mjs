import { MongoClient, ObjectId } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/raawy';

const COVER =
  'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400&q=80';

const PODCASTS = [
  { title: 'Tech Talks Daily', description: 'Latest in technology and innovation.', tags: ['tech', 'innovation'], language: 'en' },
  { title: 'Mind & Body', description: 'Wellness, fitness and mental health.', tags: ['health', 'wellness'], language: 'en' },
  { title: 'True Crime Stories', description: 'Real crime investigations and mysteries.', tags: ['crime', 'mystery'], language: 'en' },
  { title: 'Business Insider Pod', description: 'Startup culture, finance and leadership.', tags: ['business', 'finance'], language: 'en' },
  { title: 'History Unveiled', description: 'Deep dives into historical events.', tags: ['history', 'education'], language: 'en' },
  { title: 'Comedy Central Hour', description: 'Stand-up highlights and improv comedy.', tags: ['comedy', 'entertainment'], language: 'en' },
];

const EPISODE_TITLES = [
  'The Future of AI',
  'Morning Routines That Work',
  'The Cold Case Files',
  'Building a Startup from Scratch',
  'The Fall of Rome',
  'Why We Laugh',
  'Quantum Computing Explained',
  'Sleep Science Deep Dive',
  'The Zodiac Killer Revisited',
  'Venture Capital 101',
  'Ancient Egypt Uncovered',
  'The Art of Stand-Up',
];

async function seed() {
  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db();

  // 1. Get or create a category
  let category = await db.collection('categories').findOne({});
  if (!category) {
    const res = await db.collection('categories').insertOne({
      slug: 'general',
      name: 'General',
      parentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    category = { _id: res.insertedId };
    console.log('Created category:', category._id);
  } else {
    console.log('Using existing category:', category._id);
  }

  // 2. Get or create an owner user
  let user = await db.collection('users').findOne({});
  if (!user) {
    const res = await db.collection('users').insertOne({
      username: 'seed_user',
      email: 'seed@example.com',
      passwordHash: 'x',
      role: 'creator',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    user = { _id: res.insertedId };
    console.log('Created user:', user._id);
  } else {
    console.log('Using existing user:', user._id);
  }

  // 3. Check for existing seed podcasts
  const existingCount = await db.collection('podcasts').countDocuments({ status: 'published' });
  if (existingCount >= 6) {
    console.log(`Already have ${existingCount} published podcasts — skipping seed.`);
    await client.close();
    return;
  }

  // 4. Insert podcasts + episodes
  const now = new Date();
  let epIdx = 0;

  for (const pod of PODCASTS) {
    const podcastId = new ObjectId();
    await db.collection('podcasts').insertOne({
      _id: podcastId,
      ownerId: user._id,
      title: pod.title,
      description: pod.description,
      categoryId: category._id,
      subcategoryId: null,
      coverUrl: COVER,
      language: pod.language,
      tags: pod.tags,
      status: 'published',
      explicit: false,
      episodeOrder: 'newest_first',
      websiteUrl: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // 2 episodes per podcast
    for (let i = 0; i < 2; i++) {
      const publishedAt = new Date(now.getTime() - i * 86400000);
      await db.collection('episodes').insertOne({
        _id: new ObjectId(),
        podcastId,
        title: EPISODE_TITLES[epIdx % EPISODE_TITLES.length],
        description: `Episode ${i + 1} of ${pod.title}`,
        duration: 900 + i * 300,
        seasonNumber: 1,
        episodeNumber: i + 1,
        showNotes: null,
        audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        audioFormat: 'mp3',
        coverUrl: COVER,
        transcription: null,
        chapterMarkers: [],
        status: 'published',
        publishedAt,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      epIdx++;
    }

    console.log(`Inserted podcast: "${pod.title}"`);
  }

  console.log('\n✅ Seed complete — 6 podcasts + 12 episodes inserted.');
  await client.close();
}

seed().catch((e) => { console.error(e); process.exit(1); });
