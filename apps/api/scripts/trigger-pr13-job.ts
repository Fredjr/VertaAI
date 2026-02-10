/**
 * Manually trigger the job for PR #13 drift
 */
import fetch from 'node-fetch';

async function main() {
  const driftId = '9c2bf20e-293e-4a6d-8fa7-7c0e25771f47';
  const workspaceId = '63e8e9d1-c09d-4dd0-a921-6e54df1724ac';

  console.log('🚀 Manually triggering job for PR #13 drift...\n');

  const response = await fetch('https://vertaai-api-production.up.railway.app/api/jobs/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workspaceId,
      driftId,
    }),
  });

  console.log('Status:', response.status);
  console.log('Status Text:', response.statusText);

  const text = await response.text();
  console.log('\nResponse:');
  console.log(text);

  try {
    const json = JSON.parse(text);
    console.log('\nParsed JSON:');
    console.log(JSON.stringify(json, null, 2));
  } catch (e) {
    console.log('\n(Response is not JSON)');
  }
}

main().catch(console.error);

