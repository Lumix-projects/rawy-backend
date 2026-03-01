import { MongoClient } from 'mongodb';
const c = new MongoClient('mongodb://localhost:27017');
await c.connect();
const r = await c.db('raawy').collection('users').updateOne(
  { email: 'upgradetest99@test.com' },
  { $set: { emailVerified: true } }
);
console.log('modified:', r.modifiedCount);
await c.close();
