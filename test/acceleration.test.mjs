import test from 'node:test';import assert from 'node:assert/strict';import {acceleratorFromOutput,probeAccelerator,usesGpu} from '../lib/acceleration.mjs';
test('GPU detection requires an actual supported backend device, not merely a display adapter',()=>{
 assert.equal(acceleratorFromOutput('Available devices:\n'),null);
 assert.equal(acceleratorFromOutput('Vulkan0: llvmpipe (software rendering)'),null);
 assert.equal(acceleratorFromOutput('Vulkan0: Intel(R) Iris(R) Xe Graphics (4096 MiB)').device,'Vulkan');
 assert.equal(acceleratorFromOutput('Vulkan0: Intel UHD\nVulkan1: NVIDIA GeForce RTX 4060 (8192 MiB)').acceleratorId,'Vulkan1');
 assert.equal(probeAccelerator('fixture',()=>{throw Error('driver unavailable');}),null);
 assert.equal(probeAccelerator('fixture',()=> 'CUDA0: NVIDIA RTX').device,'CUDA');
 assert.equal(acceleratorFromOutput('MTL0: Apple M4 (18000 MiB)').device,'Metal');
 assert.equal(usesGpu('Vulkan'),true);assert.equal(usesGpu('CUDA'),true);assert.equal(usesGpu('CPU'),false);assert.equal(usesGpu('auto'),false);
});
