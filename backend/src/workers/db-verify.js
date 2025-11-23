const { parentPort, workerData } = require('worker_threads');
const Database = require('better-sqlite3');

if (!parentPort) throw new Error("Must be run in a worker thread");

try {
  const { filePath } = workerData;
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  
  // This is the CPU-heavy operation
  const result = db.prepare("PRAGMA integrity_check;").get();
  
  db.close();
  parentPort.postMessage(result.integrity_check === "ok");
} catch (error) {
  // Any error means invalid or corrupt DB
  parentPort.postMessage(false);
}