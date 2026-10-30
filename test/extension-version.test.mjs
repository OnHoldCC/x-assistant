import test from 'node:test';
import assert from 'node:assert/strict';
import {extensionNeedsUpgrade,extensionVersion} from '../app/src/shared/extension-version.ts';
test('extension upgrade checks the loaded version, tolerates newer clients and treats missing reports as unknown',()=>{
 assert.equal(extensionNeedsUpgrade(extensionVersion),false);
 assert.equal(extensionNeedsUpgrade(extensionVersion+'.0'),false);
 assert.equal(extensionNeedsUpgrade('1.0.0'),true);
 assert.equal(extensionNeedsUpgrade('2.0.0'),false);
 assert.equal(extensionNeedsUpgrade('1.5.12'),false,'compatible installed clients keep working after patch releases');
 assert.equal(extensionNeedsUpgrade('1.5.100'),false);
 assert.equal(extensionNeedsUpgrade('1.5.9'),true,'compare version components numerically');
 for(const value of [undefined,'','unknown','1.2.beta','65536.0.0','1.2.3.4.5'])assert.equal(extensionNeedsUpgrade(value),true);
});
