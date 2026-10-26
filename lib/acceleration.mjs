import {execFileSync} from 'node:child_process';
export function acceleratorFromOutput(output){
 const devices=[...String(output).matchAll(/^\s*((?:Vulkan|CUDA|Metal|MTL)\d*):\s*(.+)$/gm)].filter(match=>!/llvmpipe|swiftshader|software|basic render/i.test(match[2]));
 const selected=devices.find(match=>/NVIDIA|GeForce|Radeon RX|Intel.*Arc/i.test(match[2]))||devices[0];
 return selected?{device:selected[1].replace(/\d+$/,'').replace('MTL','Metal'),acceleratorId:selected[1],acceleratorName:selected[2].trim()}:null;
}
export function probeAccelerator(binary,execute=execFileSync){
 try{return acceleratorFromOutput(execute(binary,['--list-devices'],{encoding:'utf8',timeout:15000,windowsHide:true,stdio:['ignore','pipe','pipe']}));}catch{return null;}
}
export const usesGpu=device=>['Metal','CUDA','Vulkan','SYCL'].includes(device);
