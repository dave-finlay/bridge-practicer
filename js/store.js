// Saves progress on the phone using IndexedDB, the browser's built-in
// database. Two stores: every answer ever given, kept as a log, and each
// problem's progress record (see js/problems.js), which chooses what
// comes up next. An answer and its record are saved together.

const DB_NAME = 'bridge-practicer';
const DB_VERSION = 1;

let opening = null;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    // Runs the first time, and whenever DB_VERSION goes up.
    request.onupgradeneeded = () => {
      request.result.createObjectStore('answers', { autoIncrement: true });
      request.result.createObjectStore('progress', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

// Resolves once the transaction has committed, so a save is really saved.
function done(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

// Every problem's progress record, by problem id.
export async function loadProgress() {
  const db = await open();
  const transaction = db.transaction('progress', 'readonly');
  const request = transaction.objectStore('progress').getAll();
  await done(transaction);
  return Object.fromEntries(request.result.map((record) => [record.id, record]));
}

// Saves an answer, { id, call, grade, at }, and the problem's new record.
export async function saveAnswer(answer, record) {
  const db = await open();
  const transaction = db.transaction(['answers', 'progress'], 'readwrite');
  transaction.objectStore('answers').add(answer);
  transaction.objectStore('progress').put(record);
  return done(transaction);
}

// Asks the browser not to clear our data when the phone is low on space.
// Browsers may say no, and older ones don't support it; either way the
// app still works.
export async function requestPersistence() {
  return (await navigator.storage?.persist?.()) ?? false;
}
