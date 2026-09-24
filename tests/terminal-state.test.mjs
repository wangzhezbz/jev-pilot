import test from 'node:test';
import assert from 'node:assert/strict';
import {stopTask,nativeTerminal} from '../scripts/acceptance/terminal-state.mjs';
test('deadline, user interruption and native completion remain distinguishable under late acknowledgements',()=>{
  const deadline={};stopTask(deadline,'deadline');nativeTerminal(deadline,'interrupted');
  assert.deepEqual(deadline,{terminationReason:'deadline',status:'timeout',nativeTerminalStatus:'interrupted'});
  nativeTerminal(deadline,'completed');assert.equal(deadline.status,'timeout');
  const user={};stopTask(user,'signal');stopTask(user,'deadline');nativeTerminal(user,'interrupted');assert.equal(user.terminationReason,'signal');assert.equal(user.status,'interrupted');
  const success={};nativeTerminal(success,'completed');assert.equal(success.status,'completed');assert.equal(success.terminationReason,undefined);
});
