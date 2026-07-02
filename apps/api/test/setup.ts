import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from workspace root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Set NODE_ENV to test if it's not set
process.env.NODE_ENV = 'test';
process.env.ALLOW_MOCK_GATEWAY = process.env.ALLOW_MOCK_GATEWAY || 'true';
