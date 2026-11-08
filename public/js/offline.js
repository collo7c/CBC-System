// Local Storage queue for Competency_Records captured while offline.
// This plays the role of "Local Storage" in the sequence diagram:
// records are flagged here, then pushed to the server by Sync Service (below)
// once connectivity is restored.
const OFFLINE_QUEUE_KEY = "cbc_pending_records";

const OfflineQueue = {
  all() {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  },
  save(list) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(list));
  },
  add(record) {
    const list = this.all();
    record.clientUUID = record.clientUUID || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    list.push(record);
    this.save(list);
    return record;
  },
  clear() {
    this.save([]);
  },
  removeByUUIDs(uuids) {
    const keep = this.all().filter((r) => !uuids.includes(r.clientUUID));
    this.save(keep);
  },
  count() {
    return this.all().length;
  },
};

// Sync Service: pushes the queue to /api/sync, then clears acknowledged entries.
// Mirrors: Sync Service -> Central Server: push records / Central Server --> Sync Service: acknowledge receipt
async function syncPendingRecords() {
  const queue = OfflineQueue.all();
  if (queue.length === 0) return { synced: 0, acknowledged: [] };

  const result = await API.post("/sync", { records: queue });
  const uuids = result.acknowledged.map((a) => a.clientUUID).filter(Boolean);
  OfflineQueue.removeByUUIDs(uuids);
  return { synced: uuids.length, acknowledged: result.acknowledged };
}

function isOnline() {
  // The demo switch ("Simulate offline" button) forces offline mode on a single machine.
  return navigator.onLine && localStorage.getItem("cbc_simulate_offline") !== "1";
}
