import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore, query, where } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' assert { type: 'json' };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const TARGET_CLASSROOM_NAME = '디지털 기초반';
const TARGET_DATE = '2026-03-21';

async function findClassroomByName() {
  for (const collectionName of ['classrooms', 'folders']) {
    const snapshot = await getDocs(collection(db, collectionName));

    for (const classroomDoc of snapshot.docs) {
      if (classroomDoc.data().name === TARGET_CLASSROOM_NAME) {
        return {
          collectionName,
          id: classroomDoc.id,
          data: classroomDoc.data(),
        };
      }
    }
  }

  return null;
}

async function findDateRecords(classroomId) {
  const results = [];

  for (const [collectionName, fieldName] of [
    ['classroomDateRecords', 'classroomId'],
    ['folderDateRecords', 'folderId'],
  ]) {
    const snapshot = await getDocs(
      query(collection(db, collectionName), where(fieldName, '==', classroomId), where('date', '==', TARGET_DATE))
    );

    snapshot.forEach((recordDoc) => {
      results.push({
        collectionName,
        id: recordDoc.id,
        data: recordDoc.data(),
      });
    });
  }

  return results;
}

async function debugLesson() {
  const classroom = await findClassroomByName();

  if (!classroom) {
    console.log(`Classroom "${TARGET_CLASSROOM_NAME}" not found in classrooms or folders.`);
    return;
  }

  console.log('Found Classroom:', classroom.collectionName, classroom.id, classroom.data);

  const dateRecords = await findDateRecords(classroom.id);
  if (dateRecords.length === 0) {
    console.log(`No classroom record found for ${TARGET_DATE}.`);
    return;
  }

  const contentSnapshot = await getDocs(collection(db, 'contents'));
  const contentsById = new Map(contentSnapshot.docs.map((contentDoc) => [contentDoc.id, contentDoc.data()]));

  for (const record of dateRecords) {
    console.log('Classroom Record:', record.collectionName, record.id, record.data);

    const contentIds = Array.isArray(record.data.contentIds)
      ? record.data.contentIds
      : record.data.contentId
        ? [record.data.contentId]
        : [];

    if (contentIds.length === 0) {
      console.log('Record has no linked content IDs.');
      continue;
    }

    for (const contentId of contentIds) {
      const content = contentsById.get(contentId);
      if (content) {
        console.log('Content Found:', contentId, content);
      } else {
        console.log('Warning: Content ID', contentId, 'does not exist in contents collection.');
      }
    }
  }
}

debugLesson();
