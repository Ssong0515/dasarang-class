import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' assert { type: 'json' };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function debugLesson() {
  // 1. Find the folder ID for "디지털 기초반"
  const foldersRef = collection(db, 'folders');
  const foldersSnap = await getDocs(foldersRef);
  let targetFolderId = null;
  
  foldersSnap.forEach(doc => {
    if (doc.data().name === '디지털 기초반') {
      targetFolderId = doc.id;
      console.log('Found Folder:', doc.id, doc.data());
    }
  });

  if (!targetFolderId) {
    console.log('Folder "디지털 기초반" not found.');
    return;
  }

  // 2. Find the lesson for March 21, 2026
  const lessonsRef = collection(db, 'lessons');
  const lessonsQuery = query(
    lessonsRef, 
    where('folderId', '==', targetFolderId),
    where('date', '==', '2026-03-21')
  );
  
  const lessonsSnap = await getDocs(lessonsQuery);
  if (lessonsSnap.empty) {
    console.log('No lesson found for 2026-03-21.');
  } else {
    lessonsSnap.forEach(async (lessonDoc) => {
      console.log('Lesson Data:', lessonDoc.id, lessonDoc.data());
      
      const contentId = lessonDoc.data().contentId;
      if (contentId) {
        const contentsRef = collection(db, 'contents');
        const contentsSnap = await getDocs(contentsRef);
        let contentExists = false;
        contentsSnap.forEach(cDoc => {
          if (cDoc.id === contentId) {
            contentExists = true;
            console.log('Content Found:', cDoc.id, cDoc.data());
          }
        });
        if (!contentExists) {
          console.log('Warning: Content ID', contentId, 'does not exist in contents collection!');
        }
      } else {
        console.log('Lesson has no contentId.');
      }
    });
  }
}

debugLesson();
