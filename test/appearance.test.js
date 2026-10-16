import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readAppearance,createAppearance,homeColumns,homeTileSize} from '../src/appearance.js';
test('jungle and vortex preferences survive restart, with sensible first-run defaults',()=>{
  assert.deepEqual(readAppearance({getItem:()=>null}),{jungle:true,launchVortex:true});
  assert.deepEqual(readAppearance({getItem:()=>'{bad'}),{jungle:true,launchVortex:true});
  assert.deepEqual(readAppearance({getItem:()=>'{"jungle":false,"launchVortex":false}'}),{jungle:false,launchVortex:false});
});
test('more games shrink home tiles while keeping a readable minimum',()=>{
  const eight=homeTileSize(8,homeColumns(8),650,440);
  const twentyFour=homeTileSize(24,homeColumns(24),650,440);
  assert.ok(twentyFour<eight);assert.ok(twentyFour>=62);
  assert.equal(homeColumns(0),1);assert.equal(homeColumns(1),1);
  assert.ok(homeColumns(100,900)<=5);assert.ok(homeColumns(100,3840)<=9);
});
test('turning jungle off unloads the video, and hidden/reduced-motion pages pause playback',()=>{
  let saved,src=null,plays=0,pauses=0;
  const video={hasAttribute:()=>src!==null,removeAttribute:()=>{src=null},load(){},pause(){pauses++},play(){plays++;return Promise.resolve()},set src(value){src=value},muted:false};
  const page={hidden:false,body:{dataset:{}},querySelector:selector=>selector==='.jungle-video'?video:{hidden:false}};
  const reduced={matches:false,addEventListener(){},removeEventListener(){}};
  const appearance=createAppearance({storage:{getItem:()=>null,setItem:(_,value)=>{saved=JSON.parse(value)}},page,reduced});
  assert.equal(src,'./themes/jungle-4k.mp4');assert.equal(plays,1);
  appearance.set('jungle',false);assert.equal(src,null);assert.equal(saved.jungle,false);
  appearance.set('jungle',true);page.hidden=true;appearance.refresh();assert.ok(pauses>0);
  const before=plays;page.hidden=false;reduced.matches=true;appearance.refresh();assert.equal(plays,before);
  appearance.dispose();
});
