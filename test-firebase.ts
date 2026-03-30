import dotenv from 'dotenv';
dotenv.config();

import { getAdminDb } from './server/firebaseAdmin';

async function test() {
  try {
    console.log('Testing Firestore...');
    const db = getAdminDb();
    const snapshot = await db.collection('classrooms').limit(1).get();
    console.log('Success:', snapshot.size);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
