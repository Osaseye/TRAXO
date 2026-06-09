const Redis = require('ioredis');

// Upstash Redis URL will be loaded from environment variables.
// Support both UPSTASH_REDIS_URL and UPSTASH_REDIS_REST_URL (your .env uses the latter).
const REDIS_URL = process.env.UPSTASH_REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;


let redis;

if (REDIS_URL) {
  // Using ioredis is recommended for Upstash. It handles the connection
  // details (like TLS) automatically from the URL.
  redis = new Redis(REDIS_URL);

  redis.on('connect', () => {
    console.log('Successfully connected to Upstash Redis.');
  });

  redis.on('error', (error) => {
    console.error('Could not connect to Upstash Redis:', error);
  });

} else {
  console.error('CRITICAL: UPSTASH_REDIS_URL is not set in environment variables.');
  // In a real application, you might want to prevent the app from starting
  // if the Redis connection is essential. For now, we'll log a critical error.
  // We'll create a mock client to prevent the app from crashing when its methods are called.
  redis = {
    get: async () => null,
    set: async () => {},
    on: () => {},
    // Add mock implementations of any other Redis commands you use
    // to prevent `TypeError: redis.command is not a function` errors.
    publish: async () => {},
    subscribe: async () => {},
  };
}

module.exports = redis;
