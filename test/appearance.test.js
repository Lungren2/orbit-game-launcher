import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readAppearance,createAppearance} from '../src/appearance.js';
test('jungle and legacy launch-animation preferences survive restart, with sensible first-run defaults',()=>{
  assert.deepEqual(readAppearance({getItem:()=>null}),{jungle:true,launchVortex:true});
  assert.deepEqual(readAppearance({getItem:()=>'{bad'}),{jungle:true,launchVortex:true});
  assert.deepEqual(readAppearance({getItem:()=>'{"jungle":false,"launchVortex":false}'}),{jungle:false,launchVortex:false});
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
