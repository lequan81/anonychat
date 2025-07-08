// Test script to verify the inactive pair cleanup functionality
import { WebSocketServer } from "ws";
import { createServer } from "http";

// Mock connections to test the cleanup logic
const connections = new Set();
const INACTIVE_PAIR_TIMEOUT = 2 * 24 * 60 * 60 * 1000; // 2 days

// Mock WebSocket connection
class MockWebSocket {
  constructor(id) {
    this.id = id;
    this.readyState = 1; // OPEN
    this.OPEN = 1;
    this.partner = null;
    this._lastMessageTime = null;
    this._connectionStartTime = Date.now();
  }

  close(code, reason) {
    this.readyState = 3; // CLOSED
    console.log(`Connection ${this.id} closed: ${code} - ${reason}`);
  }

  send(data) {
    console.log(`Sending to ${this.id}: ${data}`);
  }
}

// Mock logger
const mockLogger = {
  inactivePairCleanup: (user1Id, user2Id, inactiveTime) => {
    console.log(
      `Logger: Inactive pair cleanup - ${user1Id} & ${user2Id}, inactive for ${Math.floor(
        inactiveTime / (24 * 60 * 60 * 1000)
      )} days`
    );
  },
  log: (message) => {
    console.log(`Logger: ${message}`);
  },
};

// Test cleanup function (copied from main implementation with fix)
function cleanupInactivePairs() {
  const now = Date.now();
  const inactivePairs = [];
  const processedPairs = new Set();

  connections.forEach((ws) => {
    // Only check paired connections
    if (ws.partner && ws.readyState === ws.OPEN && ws.partner.readyState === ws.partner.OPEN) {
      // Create a unique pair identifier (sorted to avoid duplicates)
      const pairId = [ws.id, ws.partner.id].sort().join("-");

      // Skip if this pair has already been processed
      if (processedPairs.has(pairId)) {
        return;
      }

      const timeSinceLastMessage = now - (ws._lastMessageTime || ws._connectionStartTime || 0);

      // If no messages for over 2 days, mark for cleanup
      if (timeSinceLastMessage > INACTIVE_PAIR_TIMEOUT) {
        processedPairs.add(pairId);
        inactivePairs.push({
          user1: ws,
          user2: ws.partner,
          inactiveTime: timeSinceLastMessage,
          lastMessageTime: ws._lastMessageTime || ws._connectionStartTime || 0,
        });
      }
    }
  });

  // Disconnect inactive pairs
  inactivePairs.forEach(({ user1, user2, inactiveTime }) => {
    mockLogger.inactivePairCleanup(user1.id, user2.id, inactiveTime);

    // Send inactivity disconnect message to both users
    user1.send(
      JSON.stringify({
        type: "system",
        system: "[SYSTEM] Connection closed due to inactivity (2+ days without messages).",
      })
    );
    user2.send(
      JSON.stringify({
        type: "system",
        system: "[SYSTEM] Connection closed due to inactivity (2+ days without messages).",
      })
    );

    // Close both connections
    setTimeout(() => {
      if (user1.readyState === user1.OPEN) {
        user1.close(1000, "Inactive for 2+ days");
      }
      if (user2.readyState === user2.OPEN) {
        user2.close(1000, "Inactive for 2+ days");
      }
    }, 100); // Shortened for testing
  });

  if (inactivePairs.length > 0) {
    mockLogger.log(`Cleaned up ${inactivePairs.length} inactive pairs`);
  }

  return inactivePairs.length;
}

// Test scenarios
console.log("Testing inactive pair cleanup...\n");

// Clear connections set before starting tests
connections.clear();

// Test 1: Active pair (should NOT be cleaned up)
console.log("Test 1: Active pair (recent messages)");
const user1 = new MockWebSocket("user1");
const user2 = new MockWebSocket("user2");
user1.partner = user2;
user2.partner = user1;
user1._lastMessageTime = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago
user2._lastMessageTime = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago
connections.add(user1);
connections.add(user2);

const cleaned1 = cleanupInactivePairs();
console.log(`Result: ${cleaned1} pairs cleaned (expected: 0)\n`);

// Test 2: Inactive pair (should be cleaned up)
console.log("Test 2: Inactive pair (3 days old)");
const user3 = new MockWebSocket("user3");
const user4 = new MockWebSocket("user4");
user3.partner = user4;
user4.partner = user3;
user3._lastMessageTime = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3 days ago
user4._lastMessageTime = Date.now() - 3 * 24 * 60 * 60 * 1000; // 3 days ago
connections.add(user3);
connections.add(user4);

const cleaned2 = cleanupInactivePairs();
console.log(`Result: ${cleaned2} pairs cleaned (expected: 1)\n`);

// Test 3: Single user (should NOT be cleaned up)
console.log("Test 3: Single user without partner");
const user5 = new MockWebSocket("user5");
user5._lastMessageTime = Date.now() - 5 * 24 * 60 * 60 * 1000; // 5 days ago
connections.add(user5);

const cleaned3 = cleanupInactivePairs();
console.log(`Result: ${cleaned3} pairs cleaned (expected: 0)\n`);

console.log("Test completed!");
