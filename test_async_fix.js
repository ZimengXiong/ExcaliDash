#!/usr/bin/env node

/**
 * Test script to verify async file operations are non-blocking
 * This simulates the database import scenario with a large file
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const BACKEND_PORT = 8001; // Use different port to avoid conflicts
const TEST_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const TEST_DB_PATH = path.join(__dirname, 'test_large_db.db');

// Create a test database file
function createTestDatabase(size) {
  console.log(`Creating test database file (${size / (1024 * 1024)}MB)...`);
  const buffer = Buffer.alloc(size);
  // Add SQLite header to make it a valid-ish file
  buffer.write('SQLite format 3\0', 0);
  
  fs.writeFileSync(TEST_DB_PATH, buffer);
  console.log('Test database created successfully');
}

// Cleanup function
function cleanup() {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
    console.log('Test database cleaned up');
  }
}

// Test async operations don't block
async function testNonBlockingBehavior() {
  console.log('\n=== Testing Non-Blocking File Operations ===\n');
  
  // Create test database
  createTestDatabase(TEST_FILE_SIZE);
  
  return new Promise((resolve) => {
    console.log('Starting backend server...');
    
    // Start backend server
    const backend = spawn('node', ['src/index.ts'], {
      cwd: path.join(__dirname, 'backend'),
      env: { ...process.env, PORT: BACKEND_PORT.toString() },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let serverReady = false;
    let healthCheckPassed = false;
    
    backend.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Backend] ${output.trim()}`);
      
      if (output.includes('Server running on port')) {
        serverReady = true;
      }
    });
    
    backend.stderr.on('data', (data) => {
      console.error(`[Backend Error] ${data.toString().trim()}`);
    });
    
    // Wait for server to be ready, then test health endpoints
    setTimeout(() => {
      if (!serverReady) {
        console.error('Server failed to start');
        backend.kill();
        cleanup();
        resolve(false);
        return;
      }
      
      console.log('\n--- Testing Health Endpoint (should work during file ops) ---');
      
      // Test health endpoint multiple times to ensure it's responsive
      const healthTests = [];
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const healthReq = spawn('curl', ['-s', `http://localhost:${BACKEND_PORT}/health`]);
          
          healthReq.stdout.on('data', (data) => {
            const response = data.toString();
            console.log(`Health check ${i + 1}: ${response}`);
            healthCheckPassed = healthCheckPassed || response.includes('ok');
          });
          
          healthReq.stderr.on('data', (data) => {
            console.error(`Health check ${i + 1} error: ${data.toString()}`);
          });
        }, i * 1000);
      }
      
      // Test file upload (simulating the blocking operation)
      setTimeout(() => {
        console.log('\n--- Testing File Upload (simulating async operations) ---');
        
        const formData = `--boundary\r\nContent-Disposition: form-data; name="db"; filename="test.db"\r\nContent-Type: application/octet-stream\r\n\r\n`;
        const endBoundary = `\r\n--boundary--\r\n`;
        
        const fileContent = fs.readFileSync(TEST_DB_PATH);
        const uploadData = Buffer.concat([
          Buffer.from(formData),
          fileContent,
          Buffer.from(endBoundary)
        ]);
        
        const uploadReq = spawn('curl', [
          '-X', 'POST',
          '-H', `Content-Type: multipart/form-data; boundary=boundary`,
          '--data-binary', `@-`,
          `http://localhost:${BACKEND_PORT}/import/sqlite/verify`
        ], {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        uploadReq.stdin.write(uploadData);
        uploadReq.stdin.end();
        
        let uploadResponse = '';
        uploadReq.stdout.on('data', (data) => {
          uploadResponse += data.toString();
        });
        
        uploadReq.on('close', (code) => {
          console.log(`Upload test completed with code: ${code}`);
          console.log(`Response: ${uploadResponse}`);
          
          // Final health check to ensure server is still responsive
          setTimeout(() => {
            const finalHealthReq = spawn('curl', ['-s', `http://localhost:${BACKEND_PORT}/health`]);
            finalHealthReq.stdout.on('data', (data) => {
              const response = data.toString();
              console.log(`Final health check: ${response}`);
              
              backend.kill();
              cleanup();
              
              const success = healthCheckPassed && response.includes('ok');
              console.log(`\n=== Test Result: ${success ? 'PASS' : 'FAIL'} ===`);
              console.log(`Health checks responsive: ${healthCheckPassed}`);
              console.log(`Server still responsive after upload: ${response.includes('ok')}`);
              
              resolve(success);
            });
          }, 2000);
        });
      }, 5000); // Start upload test after 5 seconds
    }, 3000); // Wait 3 seconds for server startup
  });
}

// Run the test
testNonBlockingBehavior().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((error) => {
  console.error('Test failed with error:', error);
  cleanup();
  process.exit(1);
});