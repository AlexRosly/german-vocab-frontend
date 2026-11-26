import test from 'node:test';
import assert from 'node:assert/strict';
import {WordImagesClient, WordImagesError, readImageInfo} from '../src/lib/word-images-client.ts';
const revision='12345678-1234-4234-9234-123456789abc';
const image={revision,width:320,height:240,bytes:4};
test('image metadata is bounded and never accepts external storage URLs',()=>{
 assert.deepEqual(readImageInfo({image}),image);assert.equal(readImageInfo({image:null}),null);
 for(const bad of [{...image,revision:'../../token'},{...image,width:721},{...image,bytes:98305},{...image,height:0},{}])assert.throws(()=>readImageInfo({image:bad}));
});
test('authenticated fetch handles fixed paths, binary content and capability fallback',async()=>{
 const calls=[],controller=new AbortController();const client=new WordImagesClient(async(p,i)=>{calls.push([p,i]);if(p.endsWith('/config'))return Response.json({enabled:true,version:1});if(p.includes('/content'))return new Response(new Uint8Array([1,2,3,4]),{headers:{'Content-Type':'image/webp'}});return Response.json({image});});
 assert.equal(await client.config(),true);assert.deepEqual(await client.get('word',controller.signal),image);assert.equal((await client.blob('word',image)).size,4);assert.equal(calls[1][0],'/words/word/image');assert.equal(calls[1][1].signal,controller.signal);assert.equal(calls[1][1].cache,'no-store');
 assert.equal(await new WordImagesClient(async()=>new Response('{}',{status:404})).config(),false);
});
test('multipart upload carries the revision without overriding its boundary; invalid files never upload',async()=>{
 const calls=[],client=new WordImagesClient(async(p,i)=>{calls.push([p,i]);return Response.json({image});});
 const file=new File([new Uint8Array([1])],'word.png',{type:'image/png'});await client.save('word',null,file);assert.equal(calls[0][1].body.get('revision'),'');assert.equal(calls[0][1].headers,undefined);
 for(const file of [new File(['<svg/>'],'bad.svg',{type:'image/svg+xml'}),new File([''],'empty.png',{type:'image/png'})])await assert.rejects(client.save('word',null,file),e=>e instanceof WordImagesError&&e.status===400);
 assert.equal(calls.length,1);
});
test('conflicts stay explicit and corrupt binary responses are rejected',async()=>{
 const client=new WordImagesClient(async()=>Response.json({message:'Изображение изменилось. Загрузите актуальную версию'},{status:409}));await assert.rejects(client.remove('word',revision),e=>e instanceof WordImagesError&&e.status===409);
 for(const response of [new Response('html',{headers:{'Content-Type':'text/html'}}),new Response('x',{headers:{'Content-Type':'image/webp'}})])await assert.rejects(new WordImagesClient(async()=>response).blob('word',image));
});

test('image events remain readable in the admin change log',async()=>{
 const {WordAuditClient}=await import('../src/lib/word-audit-client.ts');const event={id:'image-audit',wordId:'word',wordGerman:'Haus',entity:'word_images',action:'INSERT',before:null,after:{revision},actor:'admin',transactionId:'1',createdAt:new Date().toISOString()};
 const client=new WordAuditClient(async()=>Response.json({page:1,pageSize:25,total:1,items:[event]}));assert.equal((await client.list(1,'')).items[0].entity,'word_images');
});
test('image paths reject traversal and foreign URL segments before requesting credentials',async()=>{
 let calls=0;const client=new WordImagesClient(async()=>{calls++;return Response.json({image:null})});for(const id of ['..','../auth','word?secret=x','https://other.test'])await assert.rejects(client.get(id));assert.equal(calls,0);
});
