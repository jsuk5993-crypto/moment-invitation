import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {deflateSync} from 'node:zlib';

const html=readFileSync(new URL('../../site/index.html',import.meta.url),'utf8');
const W=1080,H=1350;
const start=html.indexOf('function b12PNGValid(bytes)');
const end=html.indexOf('async function b12SaveCurrent()',start);
assert.ok(start>0&&end>start,'Build39 PNG verification/ZIP source must be present');
const crcStart=html.indexOf('const b12ZipTable=');
assert.ok(crcStart>start&&crcStart<end);
const zipFunctions=html.slice(start,end);
const zipCRCFunctions='';
function tools(){
 const sandbox={TextEncoder,Uint8Array,DataView,Blob,W,H};
 runInNewContext(zipCRCFunctions+zipFunctions+'this.out={b12PNGValid,b12Zip,b12CRC}',sandbox);
 return sandbox.out;
}
const exportStart=html.indexOf('async function b12SavePair()');
const exportEnd=html.indexOf('function b12Setup()',exportStart);
assert.ok(exportStart>0&&exportEnd>exportStart);
const exportBody=html.slice(exportStart,exportEnd);
function le32(buf,offset){return new DataView(buf.buffer,buf.byteOffset,buf.byteLength).getUint32(offset,true)}
function makePng(){
 const {b12CRC}=tools();
 const bytes=Buffer.alloc(H*(1+W*4)); // zeroed RGBA, each row has PNG filter 0
 const compressed=deflateSync(bytes,{level:9});
 const chunk=(name,contents)=>{
  const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);
  length.writeUInt32BE(contents.length);
  crc.writeUInt32BE(b12CRC(new Uint8Array(Buffer.concat([type,contents]))));
  return Buffer.concat([length,type,contents,crc]);
 };
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;
 return new Uint8Array(Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR',ihdr),chunk('IDAT',compressed),chunk('IEND',Buffer.alloc(0))
 ]));
}
function inspectZip(blob){
 return blob.arrayBuffer().then(arrayBuffer=>{
  const bytes=new Uint8Array(arrayBuffer),view=new DataView(arrayBuffer);
  let pos=0,entries=[];
  while(pos+4<bytes.length&&view.getUint32(pos,true)===0x04034b50){
   const crc=view.getUint32(pos+14,true),size=view.getUint32(pos+18,true);
   const len=view.getUint16(pos+26,true),name=new TextDecoder().decode(bytes.subarray(pos+30,pos+30+len));
   const data=bytes.subarray(pos+30+len,pos+30+len+size);
   entries.push({name,bytes:data,crc});
   pos+=30+len+size;
  }
  const footer=bytes.length-22;
  assert.equal(view.getUint32(footer,true),0x06054b50);
  assert.equal(view.getUint16(footer+10,true),2);
  assert.equal(view.getUint32(pos,true),0x02014b50);
  assert.equal(view.getUint32(footer+16,true),pos);
  assert.equal(entries.length,2);
  return entries;
 });
}
test('Build39: ZIP contains exactly two complete PNG files with correct CRC and names',async()=>{
 const png=makePng(),{b12Zip,b12CRC,b12PNGValid}=tools();
 assert.equal(b12PNGValid(png),true);
 const names=['moment_p_city_01_main.png','moment_p_city_02_directions.png'];
 const zip=b12Zip([[names[0],png],[names[1],png]]);
 assert.equal(zip.type,'application/zip');
 const files=await inspectZip(zip);
 assert.deepEqual(files.map(x=>x.name),names);
 for(const f of files){assert.equal(b12CRC(f.bytes),f.crc);assert.equal(b12PNGValid(f.bytes),true)}
});
test('Build39: altered/truncated/wrong-dimension PNG is refused before a ZIP can be delivered',()=>{
 const png=makePng(),{b12Zip,b12PNGValid}=tools();
 const bad=new Uint8Array(png);bad[0]=0;
 assert.equal(b12PNGValid(bad),false);
 assert.throws(()=>b12Zip([['a.png',bad],['b.png',png]]),/INVALID_PNG_PAIR/);
 const short=png.slice(0,58);assert.equal(b12PNGValid(short),false);
 const wrongDimensions=new Uint8Array(png);wrongDimensions[19]=0;
 assert.equal(b12PNGValid(wrongDimensions),false);
 assert.throws(()=>b12Zip([['a.png',png]]),/INVALID_PNG_PAIR/);
});
test('Build39: the paid export triggers exactly one ZIP download with two PNGs; restores editor state',async()=>{
 const png=makePng(),{b12PNGValid,b12Zip}=tools();
 const button={disabled:false,textContent:'save'},messages=[],downloads=[],drawCalls=[];
 const sandbox={
  b12PNGValid,b12Zip,Uint8Array,b12CanSavePair:()=>true,b12Validate:()=>true,cardSide:'front',theme:'p_city',
  b12Blob:async()=>new Blob([png],{type:'image/png'}),
  draw(){drawCalls.push(sandbox.cardSide)},
  b12DownloadBlob(blob,name){downloads.push({blob,name})},
  toast(s){messages.push(s)},console,
  $:id=>{assert.equal(id,'b12DownloadPair');return button}
 };
 runInNewContext(exportBody+'this.go=b12SavePair',sandbox);
 await sandbox.go();
 assert.deepEqual(drawCalls,['front','guide','front']);
 assert.equal(downloads.length,1);
 assert.equal(downloads[0].name,'moment_p_city_2cards.zip');
 const files=await inspectZip(downloads[0].blob);
 assert.deepEqual(files.map(x=>x.name),['moment_p_city_01_main.png','moment_p_city_02_directions.png']);
 assert.match(messages.at(-1),/다운로드를 요청/);
 assert.equal(sandbox.cardSide,'front');
 assert.equal(button.disabled,false);
});
test('Build39: failed guide rendering never downloads a partial ZIP or leaves save disabled',async()=>{
 const png=makePng(),{b12PNGValid,b12Zip}=tools();
 const button={disabled:false,textContent:'save'},messages=[],downloads=[];
 let n=0;
 const sandbox={
  b12PNGValid,b12Zip,Uint8Array,b12CanSavePair:()=>true,b12Validate:()=>true,cardSide:'front',theme:'p_city',
  b12Blob:async()=>{n++;return n===1?new Blob([png],{type:'image/png'}):null},
  draw(){},b12DownloadBlob(blob,name){downloads.push({blob,name})},
  toast(s){messages.push(s)},console:{error(){}},
  $:()=>button
 };
 runInNewContext(exportBody+'this.go=b12SavePair',sandbox);
 await sandbox.go();
 assert.equal(downloads.length,0);
 assert.match(messages.at(-1),/저장 요청에 실패/);
 assert.equal(sandbox.cardSide,'front');
 assert.equal(button.disabled,false);
 assert.equal(button.textContent,'메인 + 오시는 길 · 2장 ZIP 저장');
});
