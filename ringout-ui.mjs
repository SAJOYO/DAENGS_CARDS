import { RingoutRenderer, demoPortrait } from './ringout-renderer.mjs';
import { CropEditor, decodePhoto } from './ringout-photo.mjs';
import { createProfileStore, newId } from './ringout-profile.mjs';
import { createMatch } from './ringout-engine.mjs';
import { BODY_DEFS } from './ringout-data.mjs';

const $ = id => document.getElementById(id);
const store = createProfileStore();
const editor = new CropEditor($('crop-canvas'));
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
let renderer, demo, playerFace, avatarURL, bodyId = 'tomato', opponentBody = 'sweet-potato';
let match = null, matchId, matchOwner, matchBody, matchGeneration = 0;
let faceGeneration = 0, photoGeneration = 0, lastFaceKey = '', avatarKey = '';
let ready = false, failed = false, exited = false, photoBusy = false, drag = null, cropDrag = null;
let lastTime = null, activeTime = 0, npcWait = 0, entrance = 1, animationId;
let audioContext, soundEnabled = false;
let lastUIKey='';
const voices = new Set();
const previewPositions = [{x:-1.25,z:.2},{x:1.45,z:-.55}];
function lockProfile(locked) { for(const id of ['photo','display-name','save-name','clear-profile'])$(id).disabled=locked; }
lockProfile(true);

function stopSounds() { for (const voice of voices) { try { voice.stop(); } catch {} } voices.clear(); }
function sound(kind) {
  if (!soundEnabled || !audioContext || document.hidden || match?.state.paused) return;
  const oscillator=audioContext.createOscillator(), gain=audioContext.createGain();
  const start=audioContext.currentTime, notes={shot:[270,140],collision:[160,75],out:[220,55],win:[430,740]};
  const [a,b]=notes[kind]||notes.shot; oscillator.type='sine'; oscillator.frequency.setValueAtTime(a,start);
  oscillator.frequency.exponentialRampToValueAtTime(b,start+.14);
  gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.075,start+.01);gain.gain.exponentialRampToValueAtTime(.0001,start+.2);
  oscillator.connect(gain);gain.connect(audioContext.destination);voices.add(oscillator);
  oscillator.onended=()=>{voices.delete(oscillator);oscillator.disconnect();gain.disconnect();};oscillator.start();oscillator.stop(start+.22);
}
async function unlockSound() {
  if(!soundEnabled)return;
  try { audioContext ??= new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume(); }
  catch { soundEnabled=false; $('sound').textContent='소리 사용 불가';$('sound').setAttribute('aria-pressed','false'); }
}
$('sound').onclick=async()=>{soundEnabled=!soundEnabled;$('sound').textContent=soundEnabled?'소리 켬':'소리 끔';$('sound').setAttribute('aria-pressed',String(soundEnabled));if(soundEnabled)await unlockSound();else stopSounds();};

function syncProfile() {
  const profile=store.current;
  $('player-tag').textContent=profile.displayName;
  $('storage-note').textContent=store.sessionOnly?'변경 내용을 저장할 수 없어 이번 접속 동안만 기억해요. 이전 저장본이 남아 있을 수 있어요.':'사진은 이 기기에만 저장돼요. 원본은 업로드하지 않아요.';
  const wins=profile.wins[bodyId]||0;
  $('reward-count').textContent=`${BODY_DEFS[bodyId].name} ${wins}승 / 3승`;
  $('reward-note').textContent=wins>=3?'햇살빛 식탁 입장색을 얻었어요! 힘은 그대로예요.':'3승이면 햇살빛 식탁 입장색이 열려요.';
}
store.subscribe(syncProfile);
async function applyFace() {
  const profile=store.current, key=`${profile.id}:${profile.faceRevision}`, generation=++faceGeneration;
  if(key===lastFaceKey && playerFace) return;
  let next=demo;
  try {
    if(profile.faceBlob) {
      const decoded=await decodePhoto(profile.faceBlob);
      const c=document.createElement('canvas');c.width=c.height=512;c.getContext('2d').drawImage(decoded.image,0,0,512,512);decoded.dispose();next=c;
    }
    if(exited || generation!==faceGeneration || key!==`${store.current.id}:${store.current.faceRevision}`) return;
    playerFace=next;lastFaceKey=key;renderer?.setFace(0,next);
    if(avatarKey!==key) {
      if(avatarURL?.startsWith('blob:'))URL.revokeObjectURL(avatarURL);
      avatarURL=profile.faceBlob?URL.createObjectURL(profile.faceBlob):demo.toDataURL();$('avatar').src=avatarURL;avatarKey=key;
    }
  } catch {
    if(generation!==faceGeneration)return;
    playerFace=demo;renderer?.setFace(0,demo);$('avatar').src=demo.toDataURL();
    $('profile-feedback').textContent='저장된 사진을 읽지 못했어요. 사진을 다시 골라 주세요.';
  }
}
function setFigures() { if(renderer&&playerFace)renderer.setActors([{bodyId,face:playerFace},{bodyId:opponentBody,face:demo}]); }
function cancelDrag() {
  if(drag && $('arena').hasPointerCapture(drag.id)) $('arena').releasePointerCapture(drag.id);
  drag=null;renderer?.aim(null,0,0,0);
}
function invalidateMatch() { ++matchGeneration; match?.dispose();match=null;cancelDrag();stopSounds();npcWait=0;lastTime=null; }
function selection() {
  invalidateMatch();$('selection').hidden=false;$('play-controls').hidden=true;$('result-panel').hidden=true;$('pause-panel').hidden=true;
  $('entry-card').hidden=true;
  document.querySelector('.ro-stage').classList.remove('is-playing');$('game-banner').textContent='오늘의 주인공을 준비해 주세요';$('shot-count').textContent='한 판 최대 20번';$('mode-label').textContent='연습 식탁 · 1 대 1';
  setFigures();syncProfile();
}
function setBody(next) {
  if(!BODY_DEFS[next])return;
  selection();bodyId=next;
  document.querySelectorAll('[data-body]').forEach(b=>{b.classList.toggle('is-selected',b.dataset.body===bodyId);b.setAttribute('aria-pressed',String(b.dataset.body===bodyId));});
  $('body-note').textContent=bodyId==='tomato'?'가벼워서 멀리 미끄러져요. 너무 세게 당기면 나도 떨어져요!':'무거워서 힘있게 밀어요. 멀리 있는 상대에게는 조금씩 다가가요.';
  setFigures();syncProfile();
}
document.querySelectorAll('[data-body]').forEach(b=>b.onclick=()=>setBody(b.dataset.body));
$('opponent').onchange=e=>{opponentBody=e.target.value;selection();};
function resetAim() {
  if(!match)return;
  const a=match.state.actors.player,b=match.state.actors.npc;
  $('direction').value=Math.round(Math.atan2(b.x-a.x,-(b.z-a.z))*180/Math.PI);$('power').value=65;updateAim();
}
function aimValue() { const angle=Number($('direction').value)*Math.PI/180;return{x:Math.sin(angle),z:-Math.cos(angle),power:Number($('power').value)/100}; }
function canAim() { return !!match && !failed && !match.state.paused && match.state.phase==='aiming' && match.state.turn==='player' && entrance>=.65; }
function updateAim() {
  $('direction-value').textContent=`${$('direction').value}°`;$('power-value').textContent=`${$('power').value}%`;
  const a=aimValue();renderer?.aim(canAim()?match.state.actors.player:null,a.x,a.z,a.power);
}
$('direction').oninput=$('power').oninput=updateAim;
function start() {
  if(!ready||failed||photoBusy||exited)return;
  invalidateMatch();
  match=createMatch({playerBody:bodyId,opponentBody,seed:0x7392});matchOwner=store.current.id;matchBody=bodyId;matchId=newId();entrance=0;
  lastUIKey='';$('entry-card').src=`./art/${bodyId}.webp`;$('entry-card').hidden=reducedQuery.matches;
  $('selection').hidden=true;$('play-controls').hidden=false;$('result-panel').hidden=true;$('pause-panel').hidden=true;
  document.querySelector('.ro-stage').classList.add('is-playing');$('mode-label').textContent='한 번씩 툭! · 연습 대결';
  setFigures();resetAim();updateGameUI();unlockSound();$('arena').focus({preventScroll:true});$('arena').scrollIntoView({block:'start',behavior:'instant'});
}
$('start').onclick=$('replay').onclick=$('retry').onclick=start;
$('select').onclick=$('result-select').onclick=selection;
function shoot(aim=aimValue()) {
  if(!canAim())return false;
  if(!match.shoot(aim,'player'))return false;
  cancelDrag();sound('shot');updateGameUI();return true;
}
$('launch').onclick=()=>shoot();
function pause() { if(!match||failed||match.state.phase==='finished')return;match.pause();lastTime=null;cancelDrag();stopSounds();$('pause-panel').hidden=false;updateGameUI(); }
function resume() { if(!match||failed||document.hidden)return;match.resume();lastTime=null;$('pause-panel').hidden=true;updateGameUI();updateAim();$('arena').focus({preventScroll:true}); }
$('pause').onclick=pause;$('resume').onclick=resume;
document.addEventListener('visibilitychange',()=>{lastTime=null;if(document.hidden){pause();stopSounds();}});
function updateGameUI() {
  if(!match)return;
  const s=match.state, aim=canAim();$('launch').disabled=!aim;$('direction').disabled=!aim;$('power').disabled=!aim;
  const key=[s.phase,s.turn,s.shots,s.paused,aim].join(':');if(key===lastUIKey)return;lastUIKey=key;
  $('pause').disabled=s.phase==='finished';$('shot-count').textContent=`${s.shots} / 20번`;
  const message=s.paused?'잠시 쉬는 중':s.phase==='moving'?'데굴데굴… 끝까지 지켜봐요':s.phase==='finished'?'이번 식탁의 승부가 끝났어요':s.turn==='npc'?'연습 친구가 준비하고 있어요':'내 차례! 뒤로 당겼다 놓으세요';
  $('game-banner').textContent=message;$('turn-title').textContent=s.turn==='player'?'내 차례예요':'연습 친구 차례예요';
}
function finish(result) {
  const generation=matchGeneration;
  cancelDrag();stopSounds();$('pause-panel').hidden=true;$('result-panel').hidden=false;
  const title={win:'식탁의 주인공!',loss:'앗, 식탁 아래로!',draw:'사이좋게 무승부!'};
  $('result-title').textContent=title[result.outcome];
  $('result-detail').textContent=result.reason==='turn-limit'?'20번을 주고받아도 둘 다 남았어요. 이번 판은 무승부예요.':result.reason==='both-out'?'이번 한 방에 둘 다 식탁 밖으로! 다음 판에 다시 겨뤄요.':result.outcome==='win'?`${store.current.displayName}, 끝까지 식탁을 지켰어요. ${BODY_DEFS[matchBody].name} 1승!`:'연습 친구가 식탁을 지켰어요. 힘을 살짝 줄여 다시 도전해요.';
  if(result.outcome==='win') {
    sound('win');store.awardWin(matchId,matchBody,matchOwner).then(()=>{if(generation===matchGeneration)syncProfile();});
  }
  updateGameUI();$('replay').focus({preventScroll:true});
}
$('arena').onpointerdown=e=>{
  if(drag||!canAim()||e.button!==0)return;
  const screen=renderer.actorScreen(0),ground=renderer.groundPoint(e.clientX,e.clientY),a=match.state.actors.player;
  const nearScreen=screen&&Math.hypot(screen.x-e.clientX,screen.y-e.clientY)<65;
  if(!ground||(!nearScreen&&Math.hypot(ground.x-a.x,ground.z-a.z)>.95))return;
  drag={id:e.pointerId,start:ground,generation:matchGeneration,aim:null};$('arena').setPointerCapture(e.pointerId);$('arena').focus({preventScroll:true});
};
$('arena').onpointermove=e=>{
  if(!drag||e.pointerId!==drag.id||!canAim())return;
  const p=renderer.groundPoint(e.clientX,e.clientY);if(!p)return;
  const dx=drag.start.x-p.x,dz=drag.start.z-p.z,d=Math.hypot(dx,dz),power=Math.min(1,d/2.8);
  drag.aim=d<.12?null:{x:dx,z:dz,power};renderer.aim(drag.aim?match.state.actors.player:null,dx,dz,power);$('power-value').textContent=`${Math.round(power*100)}%`;
};
$('arena').onpointerup=e=>{if(!drag||drag.id!==e.pointerId)return;const pending=drag;cancelDrag();if(pending.aim&&pending.generation===matchGeneration)shoot(pending.aim);else updateAim();};
$('arena').onpointercancel=$('arena').onlostpointercapture=e=>{if(drag&&e.pointerId!==drag.id)return;drag=null;updateAim();};
$('arena').onkeydown=e=>{
  if(e.key==='Escape'){e.preventDefault();match?.state.paused?resume():pause();return;}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter'].includes(e.key))return;
  if(match)e.preventDefault();
  if(!canAim()||e.repeat&&[' ','Enter'].includes(e.key))return;
  if(e.key===' '||e.key==='Enter'){shoot();return;}
  if(e.key==='ArrowLeft'||e.key==='ArrowRight')$('direction').value=Math.max(-180,Math.min(180,Number($('direction').value)+(e.key==='ArrowLeft'?-5:5)));
  else $('power').value=Math.max(10,Math.min(100,Number($('power').value)+(e.key==='ArrowDown'?-5:5)));
  updateAim();
};

$('photo').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(!ready||exited)return;
  photoBusy=true;$('start').disabled=true;selection();const generation=++photoGeneration;$('profile-feedback').textContent='사진을 준비하고 있어요…';
  try { if(!await editor.setFile(file)||generation!==photoGeneration||exited)return;selection();$('zoom').value=1;$('crop-dialog').showModal();$('profile-feedback').textContent=''; }
  catch(error){if(generation===photoGeneration){photoBusy=false;$('start').disabled=!ready||failed;$('profile-feedback').textContent=error.message;}}
};
$('zoom').oninput=e=>editor.setZoom(e.target.value);
document.querySelectorAll('[data-nudge]').forEach(b=>b.onclick=()=>editor.move(...b.dataset.nudge.split(',').map(Number)));
$('crop-canvas').onpointerdown=e=>{cropDrag={id:e.pointerId,x:e.clientX,y:e.clientY};e.target.setPointerCapture(e.pointerId);};
$('crop-canvas').onpointermove=e=>{if(!cropDrag||cropDrag.id!==e.pointerId)return;const r=e.target.getBoundingClientRect();editor.move((e.clientX-cropDrag.x)/r.width,(e.clientY-cropDrag.y)/r.height);cropDrag.x=e.clientX;cropDrag.y=e.clientY;};
$('crop-canvas').onpointerup=$('crop-canvas').onpointercancel=()=>cropDrag=null;
$('crop-dialog').addEventListener('close',()=>{++photoGeneration;editor.setImage(null);cropDrag=null;photoBusy=false;$('start').disabled=!ready||failed;$('confirm-photo').disabled=false;});
$('confirm-photo').onclick=async()=>{
  const generation=photoGeneration;$('confirm-photo').disabled=true;
  try {
    const blob=await editor.encode();if(generation!==photoGeneration)return;
    selection();
    const saved=store.replaceFace(blob); // Commit identity synchronously, before any newer clear/replace.
    await applyFace();await saved;if(generation!==photoGeneration)return;
    $('crop-dialog').close();$('profile-feedback').textContent='이 얼굴로 준비됐어요.';syncProfile();
  } catch(error){if(generation===photoGeneration)$('profile-feedback').textContent=error.message;}
  finally {if(generation===photoGeneration)$('confirm-photo').disabled=false;}
};
$('save-name').onclick=async()=>{await store.setDisplayName($('display-name').value);$('display-name').value=store.current.displayName;$('profile-feedback').textContent='이름을 저장했어요.';};
$('display-name').onkeydown=e=>{if(e.key==='Enter'){$('save-name').click();e.preventDefault();}};
$('clear-profile').onclick=async()=>{
  ++photoGeneration;++faceGeneration;photoBusy=false;$('start').disabled=!ready||failed;editor.setImage(null);if($('crop-dialog').open)$('crop-dialog').close();selection();
  const saved=store.clear();$('display-name').value=store.current.displayName;await applyFace();await saved;syncProfile();$('profile-feedback').textContent=store.sessionOnly?'이번 접속의 사진과 기록을 초기화했어요. 저장소에 있던 이전 기록은 남아 있을 수 있어요.':'사진과 승리 기록을 지웠어요. 네오로 다시 시작해요.';
};
function graphicsFailure(detail) { pause();failed=true;if(typeof detail==='string')$('error-detail').textContent=detail;$('pause-panel').hidden=true;$('error-panel').hidden=false;$('start').disabled=true;stopSounds();$('graphics-retry').focus({preventScroll:true}); }
$('graphics-retry').onclick=()=>location.reload();
function frame(timestamp) {
  const dt=lastTime===null?0:Math.min(.25,Math.max(0,(timestamp-lastTime)/1000));lastTime=timestamp;
  if(!document.hidden&&!failed) {
    const paused=match?.state.paused;
    if(!paused)activeTime+=dt;
    if(match&&!paused) {
      entrance+=dt;
      if(entrance>=.65)$('entry-card').hidden=true;
      const events=entrance>=.65?match.advance(dt):[];
      for(const event of events){if(event.type==='collision')sound('collision');if(event.type==='out')sound('out');if(event.type==='settled'){npcWait=0;resetAim();}if(event.type==='result')finish(event.result);}
      if(match.state.phase==='aiming'&&match.state.turn==='npc') {
        npcWait+=dt;
        if(npcWait>=1.1){const shot=match.planNpcShot();if(shot&&match.shoot(shot,'npc')){sound('shot');npcWait=0;renderer.aim(null,0,0,0);}}
      }
      updateGameUI();if(!drag&&canAim())updateAim();
    }
    const result=match?.state.result;
    renderer.render(match?[match.state.actors.player,match.state.actors.npc]:previewPositions,activeTime,{reduced:reducedQuery.matches,preview:!match,cosmetic:(store.current.wins[bodyId]||0)>=3,winner:result?.outcome==='win'?0:result?.outcome==='loss'?1:null,entrance:match?entrance:1,aiming:!!drag});
  }
  animationId=requestAnimationFrame(frame);
}
window.addEventListener('pagehide',()=>{exited=true;invalidateMatch();++photoGeneration;++faceGeneration;editor.dispose();renderer?.dispose();cancelAnimationFrame(animationId);if(avatarURL?.startsWith('blob:'))URL.revokeObjectURL(avatarURL);audioContext?.close();});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
try {
  renderer=new RingoutRenderer($('arena'),graphicsFailure);demo=await demoPortrait();
  if(!exited){playerFace??=demo;setFigures();await store.load();}
  if(!exited){$('display-name').value=store.current.displayName;await applyFace();}
  if(!exited&&!failed){syncProfile();ready=true;lockProfile(false);$('start').disabled=false;$('start').textContent='식탁 위로 출동! →';animationId=requestAnimationFrame(frame);}
} catch { if(!exited&&!failed)graphicsFailure(renderer?'게임 그림이나 저장 정보를 불러오지 못했어요. 새로고침한 뒤에도 안 되면 도감으로 돌아가 주세요.':undefined); }

// Read-only development inspection used by the separate local browser verification page.
// No diagnostic controls or profile/photo data are sent anywhere.
export function inspectGame() {
  return {ready,failed,bodyId,opponentBody,matchGeneration,state:match?structuredClone(match.state):null,
    profile:{id:store.current.id,revision:store.current.faceRevision,bytes:store.current.faceBytes,name:store.current.displayName,wins:{...store.current.wins},sessionOnly:store.sessionOnly},
    graphics:renderer?{geometries:renderer.renderer.info.memory.geometries,textures:renderer.renderer.info.memory.textures,faceIsolated:renderer.actors[0]?.portraitMaterial!==renderer.actors[1]?.portraitMaterial,npcUsesDemo:renderer.actors[1]?.image===demo,playerUsesDemo:renderer.actors[0]?.image===demo,actorScreen:renderer.actorScreen(0)}:null};
}
