/** S3 relay endpoint parser smoke. Run: npm run smoke:relay-endpoint */

import { resolveRoomEndpoint } from '../relay/src/endpoint';

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function main(): void {
  const create = resolveRoomEndpoint('/create', () => 'A7K9Q2');
  expect(create?.intent === 'create' && create.code === 'A7K9Q2', 'create path must allocate host room code');

  const join = resolveRoomEndpoint('/room/A7K9Q2', () => 'ZZZZZZ');
  expect(join?.intent === 'join' && join.code === 'A7K9Q2', 'valid room path must join exact code');

  expect(resolveRoomEndpoint('/room/oops', () => 'A7K9Q2') === null, 'invalid room code must reject');
  expect(resolveRoomEndpoint('/other/A7K9Q2', () => 'A7K9Q2') === null, 'unknown path must reject');
  expect(resolveRoomEndpoint('/create', () => 'oops') === null, 'invalid generated code must reject');

  console.log('Relay endpoint cases: 5/5 observed');
}

main();