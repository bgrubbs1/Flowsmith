import './stub-dom.js';
import {it,expect} from 'vitest';
import {record} from '../src/director.js';
it.each(['stop','error','timeout'])('keeps a labeled partial recording after %s',async(kind)=>{
 const create=document.createElement, previous=globalThis.MediaRecorder;
 const tracks=[{stopped:false,stop(){this.stopped=true;}}];
 document.createElement=()=>({width:1,height:1,getContext:()=>({drawImage(){},fillRect(){},fillText(){},measureText(){return {width:10};}}),captureStream:()=>({getTracks:()=>tracks})});
 globalThis.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['test-video'])});this.onstop();}};
 const controller=new AbortController(),canvas={width:100,height:50};
 try{
 const task=record(canvas,{},()=>kind==='error'?Promise.reject(new Error('valve timeout')):new Promise(()=>{}),'demo.webm',{signal:controller.signal,maxDurationMs:kind==='timeout'?1:180000,cancel:()=>controller.abort()});
 if(kind==='stop')controller.abort();
 const result=await task;expect(result.complete).toBe(false);if(kind==='timeout')expect(result.error).toBe('Automatic capture time limit reached');expect(result.fileName).toBe('demo-partial.webm');expect(result.bytes).toBeGreaterThan(0);expect(canvas.__captureFrame).toBeUndefined();expect(tracks[0].stopped).toBe(true);URL.revokeObjectURL(result.url);
 }finally{document.createElement=create;globalThis.MediaRecorder=previous;}
});
