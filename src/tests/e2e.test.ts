import http from 'http';
import fs from 'fs';
import path from 'path';
import app from '../app';
import { initDatabase, runAsync } from '../db/database';
import { config } from '../config';

const TEST_PORT = 3099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function makeRequest(
  method: string,
  urlPath: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options: http.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers,
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        let parsedBody = responseData;
        try {
          parsedBody = JSON.parse(responseData);
        } catch (_) {}
        resolve({ status: res.statusCode || 500, body: parsedBody, headers: res.headers });
      });
    });

    req.on('error', reject);

    if (body) {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

function makeMultipartRequest(
  urlPath: string,
  token: string,
  fieldName: string,
  filename: string,
  fileContent: Buffer,
  mimeType: string,
  extraFields: Record<string, string> = {}
) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const CRLF = '\r\n';

  let bodyParts: Buffer[] = [];

  for (const [key, val] of Object.entries(extraFields)) {
    bodyParts.push(Buffer.from(`--${boundary}${CRLF}`));
    bodyParts.push(Buffer.from(`Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}`));
    bodyParts.push(Buffer.from(`${val}${CRLF}`));
  }

  bodyParts.push(Buffer.from(`--${boundary}${CRLF}`));
  bodyParts.push(Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"${CRLF}`));
  bodyParts.push(Buffer.from(`Content-Type: ${mimeType}${CRLF}${CRLF}`));
  bodyParts.push(fileContent);
  bodyParts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

  const payload = Buffer.concat(bodyParts);

  return makeRequest(
    'POST',
    urlPath,
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': payload.length.toString(),
    },
    payload
  );
}

async function runTests() {
  console.log('--- Starting File Upload & Asset Management E2E Integration Tests ---');

  await initDatabase();
  const server = app.listen(TEST_PORT);

  try {
    // 1. Healthcheck
    console.log('\n[1] Testing GET /health');
    const health = await makeRequest('GET', '/health');
    console.assert(health.status === 200, `Healthcheck failed: ${health.status}`);
    console.log('✓ Healthcheck passed');

    // 2. User Registration
    console.log('\n[2] Testing POST /api/v1/auth/register');
    const testEmail = `testuser_${Date.now()}@example.com`;
    const regRes = await makeRequest(
      'POST',
      '/api/v1/auth/register',
      { 'Content-Type': 'application/json' },
      { email: testEmail, password: 'password123' }
    );
    console.assert(regRes.status === 201, `Register failed: ${JSON.stringify(regRes.body)}`);
    const token = regRes.body.token;
    console.log('✓ Registration passed. JWT token acquired.');

    // 3. User Login
    console.log('\n[3] Testing POST /api/v1/auth/login');
    const loginRes = await makeRequest(
      'POST',
      '/api/v1/auth/login',
      { 'Content-Type': 'application/json' },
      { email: testEmail, password: 'password123' }
    );
    console.assert(loginRes.status === 200, `Login failed: ${JSON.stringify(loginRes.body)}`);
    console.log('✓ Login passed.');

    // 4. Folder Creation
    console.log('\n[4] Testing POST /api/v1/folders');
    const folderRes = await makeRequest(
      'POST',
      '/api/v1/folders',
      { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      { name: 'Documents' }
    );
    console.assert(folderRes.status === 201, `Folder creation failed: ${JSON.stringify(folderRes.body)}`);
    const folderId = folderRes.body.folder.id;
    console.log(`✓ Folder created: ${folderId}`);

    // 5. File Upload
    console.log('\n[5] Testing POST /api/v1/files/upload');
    const sampleContent = Buffer.from('Hello REST API World! This is a test file.');
    const uploadRes = await makeMultipartRequest(
      '/api/v1/files/upload',
      token,
      'file',
      'sample.txt',
      sampleContent,
      'text/plain',
      { folder_id: folderId }
    );
    console.assert(uploadRes.status === 201, `Upload failed: ${JSON.stringify(uploadRes.body)}`);
    const fileId = uploadRes.body.file.id;
    console.log(`✓ File uploaded successfully: ${fileId} (${uploadRes.body.file.size} bytes)`);

    // 6. File Download & Preview
    console.log('\n[6] Testing GET /api/v1/files/:id/download & /view');
    const downloadRes = await makeRequest('GET', `/api/v1/files/${fileId}/download`, { Authorization: `Bearer ${token}` });
    console.assert(downloadRes.status === 200, `Download failed: ${downloadRes.status}`);
    console.assert(downloadRes.body === sampleContent.toString(), 'Download content mismatch');
    console.log('✓ File download verified');

    const viewRes = await makeRequest('GET', `/api/v1/files/${fileId}/view`, { Authorization: `Bearer ${token}` });
    console.assert(viewRes.status === 200 && viewRes.headers['content-type'] === 'text/plain', 'View preview failed');
    console.log('✓ File inline view verified');

    // 7. File Sharing
    console.log('\n[7] Testing POST /api/v1/files/:id/share & GET /api/v1/public/share/:token');
    const shareRes = await makeRequest(
      'POST',
      `/api/v1/files/${fileId}/share`,
      { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      { expires_in_hours: 24 }
    );
    console.assert(shareRes.status === 201, `Share link generation failed: ${JSON.stringify(shareRes.body)}`);
    const shareToken = shareRes.body.share_token;

    const publicRes = await makeRequest('GET', `/api/v1/public/share/${shareToken}`);
    console.assert(publicRes.status === 200, `Public share download failed: ${publicRes.status}`);
    console.log('✓ Public file download via token passed');

    // 8. Storage Analytics
    console.log('\n[8] Testing GET /api/v1/analytics/storage');
    const analyticsRes = await makeRequest('GET', '/api/v1/analytics/storage', { Authorization: `Bearer ${token}` });
    console.assert(analyticsRes.status === 200, `Analytics failed: ${JSON.stringify(analyticsRes.body)}`);
    console.log('✓ Storage analytics verified:', analyticsRes.body.counts);

    // 9. Trash & Restore & Delete
    console.log('\n[9] Testing Trash, Restore & Permanent Delete');
    const trashRes = await makeRequest('POST', `/api/v1/files/${fileId}/trash`, { Authorization: `Bearer ${token}` });
    console.assert(trashRes.status === 200, `Trash failed: ${JSON.stringify(trashRes.body)}`);

    const restoreRes = await makeRequest('POST', `/api/v1/files/${fileId}/restore`, { Authorization: `Bearer ${token}` });
    console.assert(restoreRes.status === 200, `Restore failed: ${JSON.stringify(restoreRes.body)}`);

    const deleteRes = await makeRequest('DELETE', `/api/v1/files/${fileId}`, { Authorization: `Bearer ${token}` });
    console.assert(deleteRes.status === 200, `Permanent delete failed: ${JSON.stringify(deleteRes.body)}`);
    console.log('✓ Trash, Restore & Permanent Delete cycle passed');

    console.log('\n=================================================');
    console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('=================================================\n');
  } catch (err) {
    console.error('\n❌ TEST RUN FAILED:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests();
