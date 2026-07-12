import { useState, useEffect, useRef } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV = Object.fromEntries(RANKS.map((r,i) => [r, i+2]));
const isRed = s => s==='♥'||s==='♦';
const SB=25, BB=50;
const COMM_N = {preflop:0, flop:3, turn:4, river:5};

// ─── DECK ─────────────────────────────────────────────────────────────────────
const mkDeck = () => { const d=[]; SUITS.forEach(s=>RANKS.forEach(r=>d.push({r,s}))); return d; };
const shuf = a => { const d=[...a]; for(let i=d.length-1;i>0;i--){const j=0|Math.random()*(i+1);[d[i],d[j]]=[d[j],d[i]];} return d; };

// ─── HAND EVALUATOR ───────────────────────────────────────────────────────────
const cmpA = (a,b) => { for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return a[i]-b[i]; return 0; };
const e5 = cs => {
  const vs=cs.map(c=>RV[c.r]).sort((a,b)=>b-a);
  const fl=new Set(cs.map(c=>c.s)).size===1;
  let st=false,sh=vs[0];
  if(vs[0]-vs[4]===4&&new Set(vs).size===5) st=true;
  if(!st&&vs[0]===14&&vs[1]===5&&vs[2]===4&&vs[3]===3&&vs[4]===2){st=true;sh=5;}
  if(fl&&st) return {rank:sh===14&&vs[1]===13?9:8,name:sh===14&&vs[1]===13?'Royal Flush':'Straight Flush',tb:[sh]};
  const fr={}; vs.forEach(v=>fr[v]=(fr[v]||0)+1);
  const cnt=Object.entries(fr).map(([v,c])=>({v:+v,c})).sort((a,b)=>b.c-a.c||b.v-a.v);
  if(cnt[0].c===4) return {rank:7,name:'Four of a Kind',tb:[cnt[0].v,cnt[1].v]};
  if(cnt[0].c===3&&cnt[1].c===2) return {rank:6,name:'Full House',tb:[cnt[0].v,cnt[1].v]};
  if(fl) return {rank:5,name:'Flush',tb:vs};
  if(st) return {rank:4,name:'Straight',tb:[sh]};
  if(cnt[0].c===3) return {rank:3,name:'Three of a Kind',tb:[cnt[0].v,...cnt.slice(1).map(x=>x.v)]};
  if(cnt[0].c===2&&cnt[1].c===2) return {rank:2,name:'Two Pair',tb:[cnt[0].v,cnt[1].v,cnt[2].v]};
  if(cnt[0].c===2) return {rank:1,name:'Pair',tb:[cnt[0].v,...cnt.slice(1).map(x=>x.v)]};
  return {rank:0,name:'High Card',tb:vs};
};
const c5s = arr => { const r=[]; for(let a=0;a<arr.length-4;a++) for(let b=a+1;b<arr.length-3;b++) for(let c=b+1;c<arr.length-2;c++) for(let d=c+1;d<arr.length-1;d++) for(let e=d+1;e<arr.length;e++) r.push([arr[a],arr[b],arr[c],arr[d],arr[e]]); return r; };
const bestH = (hole,comm) => { const all=[...hole,...comm]; if(all.length<5) return null; let best=null; for(const cs of c5s(all)){const h=e5(cs);if(!best||h.rank>best.rank||(h.rank===best.rank&&cmpA(h.tb,best.tb)>0))best=h;} return best; };

// ─── SIDE POTS (uses totalBet — accumulated across all streets) ───────────────
const calcPots = players => {
  let rem=players.map(p=>({id:p.id,bet:p.totalBet||0,folded:p.folded}));
  const pots=[];
  while(rem.some(r=>r.bet>0)){
    const min=Math.min(...rem.filter(r=>r.bet>0).map(r=>r.bet));
    const amt=rem.reduce((s,r)=>s+Math.min(r.bet,min),0);
    const elig=rem.filter(r=>r.bet>=min&&!r.folded).map(r=>r.id);
    if(amt>0) pots.push({amount:amt,eligible:elig.length?elig:rem.filter(r=>r.bet>=min).map(r=>r.id)});
    rem=rem.map(r=>({...r,bet:Math.max(0,r.bet-min)}));
  }
  return pots;
};
const winnersFrom = (ids,players,comm) => {
  const elig=players.filter(p=>ids.includes(p.id)&&!p.folded);
  if(!elig.length) return ids.slice(0,1);
  if(elig.length===1) return [elig[0].id];
  const hs=elig.map(p=>({id:p.id,h:bestH(p.cards,comm)}));
  let bst=hs[0];
  for(const h of hs.slice(1)) if(h.h&&(!bst.h||h.h.rank>bst.h.rank||(h.h.rank===bst.h.rank&&cmpA(h.h.tb,bst.h.tb)>0))) bst=h;
  return hs.filter(h=>h.h&&bst.h&&h.h.rank===bst.h.rank&&cmpA(h.h.tb,bst.h.tb)===0).map(h=>h.id);
};

// ─── HAND STRENGTH HINT ───────────────────────────────────────────────────────
const strength = (cards,comm) => {
  if(!comm||!comm.length){
    const v1=RV[cards[0].r],v2=RV[cards[1].r];
    if(v1===v2) return v1>=10?{txt:'Premium Pair 🔥',c:'#4cff8a',p:88}:{txt:'Pocket Pair',c:'#7ee8a2',p:68};
    const hi=Math.max(v1,v2),lo=Math.min(v1,v2);
    if(hi>=13&&lo>=10) return {txt:'Strong Hand 💪',c:'#4cff8a',p:78};
    if(hi===14) return {txt:'Ace High',c:'#a0e0ff',p:62};
    if(hi>=11&&Math.abs(v1-v2)<=2) return {txt:'Connector',c:'#a0e0ff',p:52};
    if(lo>=9) return {txt:'Decent Hand',c:'#f5c842',p:40};
    return {txt:'Weak Hand',c:'#ff7070',p:18};
  }
  const h=bestH(cards,comm); if(!h) return {txt:'—',c:'#555',p:0};
  const pts=[10,32,48,62,74,82,88,93,97,100];
  return {txt:h.name,c:h.rank>=5?'#4cff8a':h.rank>=3?'#f5c842':'#ff9060',p:pts[h.rank]||0};
};

// ─── AI DECISION ──────────────────────────────────────────────────────────────
const aiDecide = (p,gs) => {
  if(p.stack===0) return {act:'call'};
  const h=bestH(p.cards,gs.community),rank=h?h.rank:-1;
  const toCall=Math.max(0,gs.currentBet-p.bet);
  const potOdds=gs.pot>0?toCall/(gs.pot+toCall):0;
  const r=Math.random();
  const raise=m=>({act:'raise',to:Math.min(Math.floor(m),p.stack+p.bet)});
  if(gs.street==='preflop'){
    const v1=RV[p.cards[0].r],v2=RV[p.cards[1].r],hi=Math.max(v1,v2),lo=Math.min(v1,v2);
    const s=v1===v2&&v1>=10?4:v1===v2?3:hi>=13&&lo>=10?3:hi>=10&&lo>=9?2:Math.abs(v1-v2)<=2?1:0;
    if(s>=4) return r<.55?raise(gs.currentBet*3):{act:'call'};
    if(s>=3) return toCall===0?(r<.4?raise(gs.currentBet*2.5):{act:'check'}):(r<.72?{act:'call'}:raise(gs.currentBet*2.5));
    if(s>=2) return toCall===0?{act:'check'}:(r<.62?{act:'call'}:{act:'fold'});
    if(s>=1) return toCall===0?{act:'check'}:(potOdds<.28&&r<.5?{act:'call'}:{act:'fold'});
    return toCall===0?{act:'check'}:(potOdds<.18&&r<.28?{act:'call'}:{act:'fold'});
  }
  if(rank>=7) return r<.55?raise(gs.pot):{act:'call'};
  if(rank>=5) return r<.5?raise(gs.pot*.75):{act:'call'};
  if(rank>=3) return toCall===0?(r<.38?raise(gs.pot*.5):{act:'check'}):(r<.62?{act:'call'}:r<.78?raise(gs.pot*.5):{act:'fold'});
  if(rank>=1) return toCall===0?{act:'check'}:(potOdds<.32?{act:'call'}:{act:'fold'});
  return toCall===0?{act:'check'}:(potOdds<.18&&r<.22?{act:'call'}:{act:'fold'});
};

// ─── PLAYER TEMPLATES ─────────────────────────────────────────────────────────
const mkPI = name => [
  {id:0,name:name||'You',emoji:'🎯',isHero:true},
  {id:1,name:'Ace',emoji:'🤖',isHero:false},
  {id:2,name:'Nova',emoji:'⚡',isHero:false},
];

// ─── ROUND INIT ───────────────────────────────────────────────────────────────
// Correct positions for both 3-handed and heads-up (2-player) play.
const mkRound = (stacks, dealerIdx, heroName) => {
  const PI = mkPI(heroName);
  const deck = shuf(mkDeck()); let di=0;
  const holeCards = [[],[],[]];
  for(let r=0;r<2;r++) for(let p=0;p<3;p++) holeCards[p].push(deck[di++]);
  di++; // burn
  const comm5=[deck[di++],deck[di++],deck[di++]]; di++;
  comm5.push(deck[di++]); di++; comm5.push(deck[di++]);

  // Active players (have chips to play)
  const activeIds = stacks.map((s,i)=>s>0?i:-1).filter(i=>i>=0);
  const isHU = activeIds.length===2;

  // Next active player helper
  const nextA = (from,skip=1) => {
    let found=0,idx=from;
    for(let i=0;i<6;i++){idx=(idx+1)%3;if(activeIds.includes(idx)){if(++found>=skip)return idx;}}
    return from;
  };

  // POSITIONS
  // 3-handed: BTN(dealer)→SB→BB; preflop BTN acts first; postflop SB first
  // Heads-up:  dealer=SB acts first preflop; non-dealer=BB acts first postflop
  let sbIdx, bbIdx, firstPre, firstPost;
  if(isHU){
    sbIdx=dealerIdx;
    bbIdx=nextA(dealerIdx);
    firstPre=dealerIdx;   // SB/dealer acts first preflop in HU
    firstPost=bbIdx;      // BB acts first postflop in HU
  } else {
    sbIdx=nextA(dealerIdx);
    bbIdx=nextA(dealerIdx,2);
    firstPre=dealerIdx;   // BTN acts first preflop in 3-handed
    firstPost=nextA(dealerIdx); // SB first postflop
  }

  const players = PI.map((pi,i) => {
    const dead=stacks[i]===0;
    const isSB=i===sbIdx,isBB=i===bbIdx;
    const blind=dead?0:isSB?Math.min(SB,stacks[i]):isBB?Math.min(BB,stacks[i]):0;
    return {
      ...pi,
      stack:Math.max(0,stacks[i]-blind),
      cards:holeCards[i],
      bet:blind, totalBet:blind,
      folded:dead, busted:dead,
      allIn:!dead&&stacks[i]===blind&&blind>0,
      lastAct:dead?'OUT':isSB?'SB':isBB?'BB':'',
    };
  });

  const pot=players.reduce((s,p)=>s+p.bet,0);
  // needToAct: plain number array — no Set (avoids React comparison issues)
  const needToAct=players.filter(p=>!p.busted&&!p.allIn).map(p=>p.id);

  return {
    players, comm5, community:[],
    pot, currentBet:BB, minRaise:BB,
    street:'preflop', actingIdx:firstPre,
    dealerIdx, sbIdx, bbIdx, firstPost,
    needToAct, winnerIds:[],
    showdown:false, handNames:{}, potWins:{},
    turnId:0, allInReveal:false, visibleComm:0, isHU,
  };
};

// ─── ACTION HANDLER ───────────────────────────────────────────────────────────
const doAction = (gs,pid,action,raiseTo) => {
  const ps=gs.players.map(p=>({...p}));
  const p=ps[pid];
  let pot=gs.pot, cb=gs.currentBet, mr=gs.minRaise;
  let nta=[...gs.needToAct];

  if(action==='fold'){
    p.folded=true; p.lastAct='Fold'; nta=nta.filter(id=>id!==pid);
  } else if(action==='check'||action==='call'){
    const tc=Math.max(0,cb-p.bet);
    if(tc>0){
      const amt=Math.min(tc,p.stack);
      p.stack-=amt; p.bet+=amt; p.totalBet+=amt; pot+=amt;
      if(p.stack===0){p.allIn=true;p.lastAct='All-in 🔥';}
      else p.lastAct='Call';
    } else p.lastAct='Check';
    nta=nta.filter(id=>id!==pid);
  } else if(action==='raise'){
    const rt=raiseTo||cb+mr;
    const amt=Math.min(Math.max(0,rt-p.bet),p.stack);
    const nb=p.bet+amt;
    mr=Math.max(mr,nb-cb); cb=nb;
    p.stack-=amt; p.bet=nb; p.totalBet+=amt; pot+=amt;
    if(p.stack===0){p.allIn=true;p.lastAct='All-in 🔥';}
    else p.lastAct=`Raise ${nb}`;
    // Re-open action for all active non-all-in players except raiser
    nta=ps.filter(x=>!x.folded&&!x.busted&&!x.allIn&&x.id!==pid).map(x=>x.id);
  }

  const ngs={...gs,players:ps,pot,currentBet:cb,minRaise:mr,needToAct:nta,turnId:(gs.turnId||0)+1};

  // Only one active player — they win everything
  if(ps.filter(p=>!p.folded).length===1) return resolveHand(ngs,false);
  // Betting done — go to next street
  if(nta.length===0) return advStreet(ngs);

  // Find next actor
  let nx=pid;
  for(let i=0;i<3;i++){const idx=(pid+1+i)%3;if(!ps[idx].folded&&!ps[idx].busted&&nta.includes(idx)){nx=idx;break;}}
  return {...ngs,actingIdx:nx};
};

// ─── ADVANCE STREET ───────────────────────────────────────────────────────────
// Returns exactly ONE step. Never recurses — useEffect drives the rest.
const advStreet = gs => {
  const ord=['preflop','flop','turn','river','showdown'];
  const nxt=ord[ord.indexOf(gs.street)+1];
  if(!nxt||nxt==='showdown') return resolveHand({...gs,community:gs.comm5,showdown:true},true);

  const comm=gs.comm5.slice(0,COMM_N[nxt]);
  const ps=gs.players.map(p=>({...p,bet:0,lastAct:p.busted||p.folded||p.allIn?p.lastAct:''}));

  // Correct first-to-act post-flop
  let fa=gs.dealerIdx;
  if(gs.isHU) fa=gs.bbIdx; // non-dealer (BB) first in HU
  else for(let i=0;i<3;i++){const idx=(gs.dealerIdx+1+i)%3;if(!ps[idx].folded&&!ps[idx].busted){fa=idx;break;}}

  const canAct=ps.filter(p=>!p.folded&&!p.busted&&!p.allIn);
  return {
    ...gs, players:ps, community:comm, street:nxt,
    currentBet:0, minRaise:BB, actingIdx:fa,
    needToAct:canAct.map(p=>p.id),
    turnId:(gs.turnId||0)+1,
  };
};

// ─── RESOLVE HAND (side pots) ─────────────────────────────────────────────────
const resolveHand = (gs,sd) => {
  const pots=calcPots(gs.players);
  const ps=gs.players.map(p=>({...p}));
  const allW=new Set(), potWins={};
  for(const pot of pots){
    const elig=ps.filter(p=>pot.eligible.includes(p.id)&&!p.folded);
    let ws=!elig.length?[pot.eligible[0]]:elig.length===1||!sd?[elig[0].id]:winnersFrom(pot.eligible,ps,gs.comm5);
    const share=Math.floor(pot.amount/ws.length),rem=pot.amount-share*ws.length;
    ws.forEach((id,i)=>{const g=share+(i===0?rem:0);ps[id].stack+=g;potWins[id]=(potWins[id]||0)+g;allW.add(id);});
  }
  const hn={};
  if(sd) ps.filter(p=>!p.folded).forEach(p=>{const h=bestH(p.cards,gs.comm5);if(h)hn[p.id]=h.name;});
  return {...gs,players:ps,pot:0,winnerIds:[...allW],street:'showdown',community:gs.comm5,showdown:true,handNames:hn,potWins};
};

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const store={
  get:k=>{try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}},
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS=`
  html,body{margin:0;padding:0;background:#07101d;min-height:100%;}
  *{box-sizing:border-box;}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
  @keyframes glow{0%,100%{box-shadow:0 0 6px rgba(245,200,66,.2)}50%{box-shadow:0 0 22px rgba(245,200,66,.65)}}
  @keyframes winGlow{0%,100%{box-shadow:0 0 8px rgba(76,255,138,.2)}50%{box-shadow:0 0 22px rgba(76,255,138,.65)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
  @keyframes deal{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
  @keyframes dot{0%,100%{opacity:.15}50%{opacity:1}}
  @keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
  input{outline:none;font-family:inherit;}
  input[type=range]{-webkit-appearance:none;height:6px;border-radius:3px;background:rgba(255,255,255,.12);}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#f5c842;cursor:pointer;border:2px solid #000;}
`;

// ─── CARD ─────────────────────────────────────────────────────────────────────
function Card({card,faceDown,sm,glow}){
  const w=sm?40:50,h=sm?58:72;
  if(faceDown) return (
    <div style={{width:w,height:h,borderRadius:8,flexShrink:0,background:'linear-gradient(145deg,#1c3f96,#0b1e5c)',border:'2px solid #3060f0',boxShadow:`0 4px 12px rgba(0,0,0,.8)${glow?',0 0 18px rgba(80,130,255,.5)':''}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:w-14,height:h-14,border:'1.5px solid rgba(100,150,255,.25)',borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(100,150,255,.35)',fontSize:18}}>★</div>
    </div>
  );
  const red=isRed(card.s),clr=red?'#d41515':'#111';
  return (
    <div style={{width:w,height:h,borderRadius:8,flexShrink:0,background:'#fefefe',border:'1.5px solid #ccc',boxShadow:`0 4px 12px rgba(0,0,0,.8)${glow?',0 0 16px rgba(255,200,50,.8)':''}`,padding:'3px 5px',display:'flex',flexDirection:'column',position:'relative',overflow:'hidden'}}>
      <div style={{fontSize:sm?12:14,fontWeight:'bold',color:clr,lineHeight:1.15}}>{card.r}</div>
      <div style={{fontSize:sm?14:18,color:clr,lineHeight:1}}>{card.s}</div>
      <div style={{position:'absolute',bottom:2,right:3,fontSize:sm?20:26,color:clr,opacity:.6,transform:'rotate(180deg)'}}>{card.s}</div>
    </div>
  );
}

// ─── THINKING DOTS ────────────────────────────────────────────────────────────
function Dots(){
  return (
    <div style={{display:'flex',gap:4,justifyContent:'center',alignItems:'center',height:16}}>
      {[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:'50%',background:'#f5c842',animation:`dot 1.2s ease ${i*.2}s infinite`}}/>)}
    </div>
  );
}

// ─── STRENGTH BAR ─────────────────────────────────────────────────────────────
function StrBar({cards,comm}){
  const s=strength(cards,comm);
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:5}}>
      <div style={{flex:1,height:5,background:'rgba(255,255,255,.08)',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${s.p}%`,background:s.c,borderRadius:3,transition:'width .55s ease'}}/>
      </div>
      <div style={{color:s.c,fontSize:10,fontWeight:'bold',minWidth:110,textAlign:'right'}}>{s.txt}</div>
    </div>
  );
}

// ─── PLAYER PANEL ─────────────────────────────────────────────────────────────
function PPanel({p,isAct,isDealer,showCards,isWinner,won,showdown,handName,thinking}){
  return (
    <div style={{flex:1,background:isWinner?'rgba(76,255,138,.07)':'rgba(4,10,22,.95)',border:`2px solid ${isAct?'#f5c842':isWinner?'#4cff8a':p.allIn?'rgba(255,140,0,.45)':'rgba(255,255,255,.08)'}`,borderRadius:14,padding:'10px',opacity:p.busted?.22:p.folded?.38:1,animation:isAct?'glow 1.4s infinite':isWinner?'winGlow 1.4s infinite':'none',transition:'opacity .3s'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <span style={{fontSize:20}}>{p.emoji}</span>
          <div>
            <div style={{fontSize:12,fontWeight:'bold',color:p.busted?'#444':'#fff'}}>{p.name}</div>
            <div style={{color:'#f5c842',fontSize:11}}>💰{p.stack}</div>
          </div>
        </div>
        {isDealer&&<div style={{background:'#f5c842',color:'#000',borderRadius:'50%',width:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:900,flexShrink:0}}>D</div>}
      </div>
      <div style={{display:'flex',gap:3,justifyContent:'center',marginBottom:5}}>
        {p.cards.map((c,i)=><Card key={i} card={c} faceDown={!showCards} sm glow={isWinner}/>)}
      </div>
      <div style={{textAlign:'center',minHeight:16,fontSize:11}}>
        {thinking?<Dots/>:p.allIn&&!showdown?<span style={{color:'#ff8c00',fontWeight:'bold'}}>ALL IN 🔥</span>:p.bet>0?<span style={{color:'#7ee8a2'}}>Bet {p.bet}</span>:p.lastAct?<span style={{color:'#555'}}>{p.lastAct}</span>:null}
      </div>
      {handName&&<div style={{color:'#f5c842',fontSize:10,textAlign:'center',fontWeight:'bold',animation:'fadeIn .4s',marginTop:2}}>{handName}</div>}
      {isWinner&&won>0&&<div style={{color:'#4cff8a',fontSize:12,textAlign:'center',fontWeight:'bold',marginTop:2,animation:'fadeIn .4s'}}>+{won} 🏆</div>}
      {p.busted&&<div style={{color:'#2a2a2a',fontSize:10,textAlign:'center',fontWeight:'bold',marginTop:2,letterSpacing:1}}>ELIMINATED</div>}
    </div>
  );
}

// ─── BUY-IN OPTIONS ───────────────────────────────────────────────────────────
const BUYINS=[{chips:500,label:'$500',clr:'#4a8fff'},{chips:1000,label:'$1,000',clr:'#f5c842'},{chips:2000,label:'$2,000',clr:'#ff6b35'}];

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App(){
  const [acct,setAcct]=useState(()=>store.get('pkrAcct')||null);
  const [authMode,setAuthMode]=useState('login');
  const [form,setForm]=useState({u:'',p:''});
  const [authErr,setAuthErr]=useState('');
  const [screen,setScreen]=useState(acct?'lobby':'auth');
  const [gs,setGs]=useState(null);
  const [raiseAmt,setRaiseAmt]=useState(100);
  const [showRaise,setShowRaise]=useState(false);
  const [thinking,setThinking]=useState(false);
  const [buyInAmt,setBuyInAmt]=useState(0);

  // Two separate timers — never shared
  const aiTmr=useRef(null);
  const gameTmr=useRef(null);

  const saveAcct=a=>{store.set('pkrAcct',a);setAcct(a);};
  const updateAcct=upd=>{
    const a={...acct,...upd};
    const all=store.get('pkrAccts')||{};
    all[a.username]=a;store.set('pkrAccts',all);saveAcct(a);
  };

  // ── AUTH ────────────────────────────────────────────────────────────────────
  const handleAuth=()=>{
    if(!form.u.trim()){setAuthErr('Enter a username');return;}
    if(form.p.length<4){setAuthErr('Password min 4 characters');return;}
    const all=store.get('pkrAccts')||{};
    if(authMode==='register'){
      if(all[form.u]){setAuthErr('Username taken');return;}
      const a={username:form.u,password:form.p,balance:10000,sessions:0,handsWon:0};
      all[form.u]=a;store.set('pkrAccts',all);saveAcct(a);
    } else {
      const a=all[form.u];
      if(!a||a.password!==form.p){setAuthErr('Invalid credentials');return;}
      saveAcct(a);
    }
    setAuthErr('');setScreen('lobby');
  };
  const logout=()=>{store.set('pkrAcct',null);setAcct(null);setScreen('auth');setGs(null);};

  // ── TABLE MANAGEMENT ────────────────────────────────────────────────────────
  const joinTable=b=>{
    if(!acct||acct.balance<b.chips) return;
    updateAcct({balance:acct.balance-b.chips,sessions:(acct.sessions||0)+1});
    setBuyInAmt(b.chips);
    setGs(mkRound([b.chips,b.chips,b.chips],0,acct.username));
    setScreen('table');setShowRaise(false);setThinking(false);
  };

  const leaveTable=()=>{
    if(!gs||!acct) return;
    const chips=gs.players[0].stack;
    updateAcct({balance:acct.balance+chips});
    setGs(null);setScreen('lobby');
  };

  const rebuy=()=>{
    if(!acct||acct.balance<buyInAmt||!gs) return;
    updateAcct({balance:acct.balance-buyInAmt});
    const stacks=gs.players.map((p,i)=>i===0?buyInAmt:p.stack>0?p.stack:buyInAmt);
    let nd=(gs.dealerIdx+1)%3;for(let i=0;i<3;i++){const idx=(nd+i)%3;if(stacks[idx]>0){nd=idx;break;}}
    setGs(mkRound(stacks,nd,acct.username));
    setShowRaise(false);setThinking(false);
  };

  const nextHand=()=>{
    if(!gs||!acct) return;
    // AI players auto-rebuy in a cash game
    const stacks=gs.players.map((p,i)=>i===0?p.stack:p.stack>0?p.stack:buyInAmt);
    if(stacks[0]===0) return; // hero bust — wait for rebuy/leave
    let nd=(gs.dealerIdx+1)%3;for(let i=0;i<3;i++){const idx=(nd+i)%3;if(stacks[idx]>0){nd=idx;break;}}
    setGs(mkRound(stacks,nd,acct.username));
    setShowRaise(false);setThinking(false);
  };

  // ── AI TURNS (uses aiTmr only) ───────────────────────────────────────────
  useEffect(()=>{
    if(!gs||gs.showdown||gs.allInReveal) return;
    const actor=gs.players[gs.actingIdx];
    if(!actor||actor.isHero||actor.folded||actor.busted||actor.allIn) return;
    setThinking(true);
    aiTmr.current=setTimeout(()=>{
      setThinking(false);
      const{act,to}=aiDecide(actor,gs);
      setGs(prev=>doAction(prev,actor.id,act,to));
    },800+Math.random()*1000);
    return()=>{clearTimeout(aiTmr.current);setThinking(false);};
  },[gs?.turnId]);

  // ── GAME TIMER: auto-check OR all-in reveal (uses gameTmr only) ──────────
  useEffect(()=>{
    if(!gs||gs.showdown) return;
    const active=gs.players.filter(p=>!p.folded&&!p.busted);
    const oppsAllIn=gs.players.filter(p=>!p.isHero&&!p.folded&&!p.busted&&!p.allIn&&p.stack>0).length===0;

    // Case A: Only hero can act but all opponents are all-in → auto-check hero through
    const heroAlone=oppsAllIn&&gs.needToAct.length===1&&gs.needToAct[0]===0&&!gs.allInReveal;
    if(heroAlone){
      gameTmr.current=setTimeout(()=>setGs(prev=>doAction(prev,0,'check')),400);
      return()=>clearTimeout(gameTmr.current);
    }

    // Case B: All active players are all-in → card-by-card reveal
    const allAllIn=active.length>1&&gs.needToAct.length===0&&active.every(p=>p.allIn);
    if(!allAllIn) return;

    if(!gs.allInReveal){
      gameTmr.current=setTimeout(()=>{
        setGs(prev=>({...prev,allInReveal:true,visibleComm:prev.community.length,turnId:(prev.turnId||0)+1}));
      },500);
      return()=>clearTimeout(gameTmr.current);
    }
    if(gs.visibleComm<5){
      const delay=gs.visibleComm===gs.community.length?1000:750;
      gameTmr.current=setTimeout(()=>{
        setGs(prev=>{
          if(prev.showdown) return prev;
          const next=prev.visibleComm+1;
          if(next>=5) return resolveHand({...prev,community:prev.comm5,visibleComm:5,showdown:true},true);
          return{...prev,visibleComm:next,turnId:(prev.turnId||0)+1};
        });
      },delay);
      return()=>clearTimeout(gameTmr.current);
    }
    if(!gs.showdown){
      gameTmr.current=setTimeout(()=>setGs(prev=>resolveHand({...prev,community:prev.comm5,showdown:true},true)),600);
      return()=>clearTimeout(gameTmr.current);
    }
  },[gs?.turnId,gs?.allInReveal,gs?.visibleComm]);

  // ── AUTO NEXT HAND ──────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!gs?.showdown||!gs.winnerIds?.length) return;
    if(gs.winnerIds.includes(0)) updateAcct({handsWon:(acct?.handsWon||0)+1});
    if(gs.players[0].stack===0) return; // hero bust — show rebuy UI
    const t=setTimeout(nextHand,3200);
    return()=>clearTimeout(t);
  },[gs?.showdown]);

  // ── COMPUTED ────────────────────────────────────────────────────────────────
  const h=gs?.players[0];
  const heroBust=gs?.showdown&&h?.stack===0;
  const isMyTurn=gs&&!gs.showdown&&!gs.allInReveal&&gs.actingIdx===0&&h&&!h.folded&&!h.busted&&!h.allIn;
  const toCall=h&&gs?Math.min(Math.max(0,gs.currentBet-h.bet),h.stack):0;
  const canCheck=h&&gs&&gs.currentBet<=h.bet;
  const minRA=gs&&h?Math.min(gs.currentBet+gs.minRaise,h.stack+h.bet):100;
  const hasLiveOpp=gs&&gs.players.some(p=>!p.isHero&&!p.folded&&!p.busted&&!p.allIn&&p.stack>0);
  const canRaise=isMyTurn&&hasLiveOpp&&h.stack>toCall&&(h.stack+h.bet)>gs.currentBet;
  const sidePots=gs?calcPots(gs.players):[];

  const heroAct=(action,rt)=>{
    if(!isMyTurn) return;
    setGs(prev=>doAction(prev,0,action,rt));
    setShowRaise(false);
  };

  // ════ AUTH ════════════════════════════════════════════════════════════════
  if(screen==='auth') return (
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#07101d,#0d1a2e)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'"Inter",system-ui,sans-serif',padding:'0 24px'}}>
      <style>{CSS}</style>
      <div style={{width:'100%',maxWidth:380,animation:'slideUp .4s ease'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontSize:48,marginBottom:4}}>♠️</div>
          <div style={{color:'#fff',fontSize:28,fontWeight:900,letterSpacing:2}}>POKER TABLE</div>
          <div style={{color:'#333',fontSize:11,letterSpacing:2,marginTop:4}}>TEXAS HOLD'EM · CASH GAME · 25/50</div>
        </div>
        <div style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',borderRadius:20,padding:24}}>
          <div style={{display:'flex',background:'rgba(0,0,0,.3)',borderRadius:10,marginBottom:20,padding:3}}>
            {['login','register'].map(m=>(
              <button key={m} onClick={()=>{setAuthMode(m);setAuthErr('');}} style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:authMode===m?'rgba(245,200,66,.12)':'transparent',color:authMode===m?'#f5c842':'#444',fontWeight:'bold',fontSize:13,cursor:'pointer',fontFamily:'inherit',transition:'all .2s'}}>
                {m==='login'?'Log In':'Register'}
              </button>
            ))}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {[{f:'u',l:'USERNAME',ph:'Enter username',t:'text'},{f:'p',l:'PASSWORD',ph:'Enter password',t:'password'}].map(({f,l,ph,t})=>(
              <div key={f}>
                <div style={{color:'#555',fontSize:10,marginBottom:4,letterSpacing:1}}>{l}</div>
                <input type={t} value={form[f]} onChange={e=>setForm(x=>({...x,[f]:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAuth()} placeholder={ph} style={{width:'100%',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.09)',borderRadius:10,padding:'11px 14px',color:'#fff',fontSize:14}}/>
              </div>
            ))}
            {authErr&&<div style={{color:'#ff6b6b',fontSize:12,textAlign:'center',background:'rgba(255,0,0,.07)',padding:'7px',borderRadius:8}}>{authErr}</div>}
            {authMode==='register'&&<div style={{color:'#4a9',fontSize:11,textAlign:'center'}}>🎁 New accounts start with $10,000</div>}
            <button onClick={handleAuth} style={{background:'linear-gradient(135deg,#0e2a5c,#1a4abf)',border:'2px solid #2a5fff',color:'#fff',padding:'13px',fontSize:15,fontWeight:'bold',borderRadius:12,cursor:'pointer',fontFamily:'inherit',marginTop:4}}>
              {authMode==='login'?'Log In →':'Create Account →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ════ LOBBY ═══════════════════════════════════════════════════════════════
  if(screen==='lobby') return (
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#07101d,#0d1a2e)',fontFamily:'"Inter",system-ui,sans-serif',color:'#fff'}}>
      <style>{CSS}</style>
      <div style={{background:'rgba(0,0,0,.4)',borderBottom:'1px solid rgba(255,255,255,.05)',padding:'13px 18px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{color:'#fff',fontWeight:800,fontSize:14}}>♠ POKER TABLE</div>
          <div style={{color:'#333',fontSize:10,letterSpacing:1}}>CASH GAME · 25/50</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{color:'#ccc',fontSize:12}}>👤 {acct?.username}</div>
          <div style={{color:'#f5c842',fontSize:13,fontWeight:'bold'}}>💰${acct?.balance?.toLocaleString()}</div>
        </div>
        <button onClick={logout} style={{background:'transparent',border:'1px solid rgba(255,255,255,.1)',color:'#444',padding:'6px 11px',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:12}}>Logout</button>
      </div>
      <div style={{padding:'20px 18px',maxWidth:480,margin:'0 auto'}}>
        <div style={{display:'flex',gap:8,marginBottom:24}}>
          {[{l:'Balance',v:`$${acct?.balance?.toLocaleString()}`,c:'#f5c842'},{l:'Sessions',v:acct?.sessions||0,c:'#a0e0ff'},{l:'Hands Won',v:acct?.handsWon||0,c:'#4cff8a'}].map(s=>(
            <div key={s.l} style={{flex:1,background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.06)',borderRadius:12,padding:'12px 8px',textAlign:'center'}}>
              <div style={{color:s.c,fontSize:15,fontWeight:'bold'}}>{s.v}</div>
              <div style={{color:'#444',fontSize:10,marginTop:2,letterSpacing:1}}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{color:'#444',fontSize:11,letterSpacing:2,marginBottom:12}}>SELECT BUY-IN</div>
        <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:20}}>
          {BUYINS.map(b=>{
            const can=acct?.balance>=b.chips;
            return (
              <button key={b.chips} onClick={()=>can&&joinTable(b)} style={{background:can?'rgba(255,255,255,.03)':'rgba(255,255,255,.01)',border:`1.5px solid ${can?b.clr:'rgba(255,255,255,.06)'}`,borderRadius:14,padding:'16px 18px',cursor:can?'pointer':'not-allowed',fontFamily:'inherit',opacity:can?1:.4,display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all .2s'}}>
                <div style={{textAlign:'left'}}>
                  <div style={{color:can?b.clr:'#555',fontSize:20,fontWeight:900}}>{b.label}</div>
                  <div style={{color:'#333',fontSize:11,marginTop:2}}>Cash table · 3 seats · 25/50</div>
                </div>
                <div style={{color:'#fff',fontSize:13,fontWeight:'bold'}}>Join →</div>
              </button>
            );
          })}
        </div>
        {acct?.balance<500&&<div style={{background:'rgba(255,80,80,.06)',border:'1px solid rgba(255,80,80,.15)',borderRadius:12,padding:'14px',textAlign:'center',color:'#ff8888',fontSize:13}}>
          ⚠️ Insufficient balance<br/>
          <button style={{marginTop:8,background:'transparent',border:'1px solid rgba(255,100,100,.3)',color:'#ff8888',padding:'6px 14px',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:12}}>Add Funds (Coming Soon)</button>
        </div>}
      </div>
    </div>
  );

  if(!gs) return null;
  const p1=gs.players[1],p2=gs.players[2];

  // ════ TABLE ════════════════════════════════════════════════════════════════
  return (
    <div style={{width:'100%',maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'linear-gradient(160deg,#07101d,#0d1a2e)',fontFamily:'"Inter",system-ui,sans-serif',display:'flex',flexDirection:'column',color:'#fff'}}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{background:'rgba(0,0,0,.5)',borderBottom:'1px solid rgba(255,255,255,.05)',padding:'9px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <div>
          <div style={{color:'#fff',fontWeight:800,fontSize:12}}>♠ CASH TABLE</div>
          <div style={{color:'#2a2a2a',fontSize:10,letterSpacing:1}}>25 / 50</div>
        </div>
        <div style={{color:'#f5c842',fontSize:11,fontWeight:'bold',background:'rgba(245,200,66,.08)',padding:'3px 12px',borderRadius:20,border:'1px solid rgba(245,200,66,.18)',letterSpacing:1}}>
          {gs.street.toUpperCase()}{gs.isHU?' · HU':''}
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{color:'#555',fontSize:9,letterSpacing:1}}>BALANCE</div>
          <div style={{color:'#f5c842',fontSize:12,fontWeight:'bold'}}>💰${acct?.balance?.toLocaleString()}</div>
          <button onClick={leaveTable} style={{marginTop:2,background:'transparent',border:'1px solid rgba(255,255,255,.08)',color:'#444',padding:'2px 8px',borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontSize:10}}>Leave</button>
        </div>
      </div>

      {/* AI players */}
      <div style={{display:'flex',gap:8,padding:'10px 10px 0'}}>
        <PPanel p={p1} isAct={!gs.showdown&&!gs.allInReveal&&gs.actingIdx===1&&!p1.folded&&!p1.busted} isDealer={gs.dealerIdx===1} showCards={(gs.showdown||gs.allInReveal)&&!p1.busted&&!p1.folded} isWinner={gs.winnerIds.includes(1)} won={gs.potWins?.[1]} showdown={gs.showdown} handName={gs.handNames[1]} thinking={thinking&&gs.actingIdx===1}/>
        <PPanel p={p2} isAct={!gs.showdown&&!gs.allInReveal&&gs.actingIdx===2&&!p2.folded&&!p2.busted} isDealer={gs.dealerIdx===2} showCards={(gs.showdown||gs.allInReveal)&&!p2.busted&&!p2.folded} isWinner={gs.winnerIds.includes(2)} won={gs.potWins?.[2]} showdown={gs.showdown} handName={gs.handNames[2]} thinking={thinking&&gs.actingIdx===2}/>
      </div>

      {/* Felt table */}
      <div style={{margin:'10px',background:'radial-gradient(ellipse at 50% 40%,#175f2d 0%,#0b3f1d 55%,#061e0c 100%)',borderRadius:28,border:'7px solid #4a2900',outline:'2px solid #7a4d00',padding:'14px 10px 12px',display:'flex',flexDirection:'column',alignItems:'center',gap:9,boxShadow:'inset 0 0 60px rgba(0,0,0,.8)',flexShrink:0}}>
        {/* Community cards */}
        <div style={{display:'flex',gap:5}}>
          {[0,1,2,3,4].map(i=>{
            const card=gs.allInReveal?gs.comm5[i]:gs.community[i];
            const show=gs.allInReveal?i<gs.visibleComm:!!gs.community[i];
            return show
              ?<div key={i} style={{animation:'deal .35s ease'}}><Card card={card} faceDown={false}/></div>
              :<div key={i} style={{width:50,height:72,borderRadius:8,border:'1.5px dashed rgba(255,255,255,.07)',background:'rgba(0,0,0,.1)'}}/>;
          })}
        </div>
        {/* Pot + side pot */}
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={{background:'rgba(0,0,0,.6)',border:'1px solid rgba(245,200,66,.25)',borderRadius:20,padding:'4px 18px',color:'#f5c842',fontSize:14,fontWeight:'bold',minHeight:27,display:'flex',alignItems:'center'}}>
            {gs.pot>0?`💰 POT: ${gs.pot}`:gs.showdown?'✓ Resolved':'—'}
          </div>
          {sidePots.length>1&&gs.pot>0&&<div style={{color:'#ff8c00',fontSize:10,fontWeight:'bold'}}>⚡ SIDE POT</div>}
        </div>
      </div>

      {/* Hero */}
      <div style={{margin:'0 10px',flex:1}}>
        {h&&(
          <div style={{background:gs.winnerIds.includes(0)?'rgba(76,255,138,.07)':'rgba(4,10,22,.95)',border:`2px solid ${isMyTurn?'#f5c842':gs.winnerIds.includes(0)?'#4cff8a':h.allIn?'rgba(255,140,0,.5)':'rgba(255,255,255,.09)'}`,borderRadius:14,padding:'12px 14px',opacity:h.folded?.35:1,animation:isMyTurn?'glow 1.4s infinite':gs.winnerIds.includes(0)?'winGlow 1.4s infinite':'none',transition:'all .3s'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:22}}>🎯</span>
                <div>
                  <div style={{fontSize:14,fontWeight:'bold'}}>{h.name}</div>
                  <div style={{color:'#f5c842',fontSize:12}}>💰 {h.stack}</div>
                </div>
              </div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                {gs.dealerIdx===0&&<div style={{background:'#f5c842',color:'#000',borderRadius:'50%',width:20,height:20,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900}}>D</div>}
                {isMyTurn&&<div style={{color:'#f5c842',fontSize:11,fontWeight:'bold',animation:'pulse 1s infinite'}}>YOUR TURN</div>}
                {h.allIn&&!gs.showdown&&<div style={{color:'#ff8c00',fontSize:11,fontWeight:'bold'}}>ALL IN 🔥</div>}
              </div>
            </div>
            <div style={{display:'flex',gap:6,justifyContent:'center',marginBottom:6}}>
              {h.cards.map((c,i)=><Card key={i} card={c} faceDown={false} glow={gs.winnerIds.includes(0)}/>)}
            </div>
            {h.cards.length>0&&!h.folded&&<StrBar cards={h.cards} comm={gs.community}/>}
            <div style={{textAlign:'center',minHeight:16,marginTop:5,fontSize:11}}>
              {h.bet>0&&<span style={{color:'#7ee8a2'}}>Bet: {h.bet}  </span>}
              {h.lastAct&&!h.folded&&<span style={{color:'#555'}}>{h.lastAct}</span>}
            </div>
            {gs.handNames[0]&&<div style={{color:'#f5c842',fontSize:13,textAlign:'center',fontWeight:'bold',marginTop:4,animation:'fadeIn .4s'}}>{gs.handNames[0]}</div>}
            {gs.winnerIds.includes(0)&&gs.potWins?.[0]&&<div style={{color:'#4cff8a',fontSize:14,textAlign:'center',fontWeight:'bold',marginTop:4,animation:'fadeIn .4s'}}>🏆 +{gs.potWins[0]} chips!</div>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{padding:'8px 10px 20px',flexShrink:0}}>
        {heroBust?(
          <div style={{background:'rgba(255,50,50,.07)',border:'1px solid rgba(255,50,50,.18)',borderRadius:14,padding:'16px',textAlign:'center'}}>
            <div style={{color:'#ff8888',fontSize:15,fontWeight:'bold',marginBottom:12}}>💀 You're out of chips</div>
            <div style={{display:'flex',gap:8}}>
              {acct?.balance>=buyInAmt&&<button onClick={rebuy} style={{flex:2,background:'linear-gradient(135deg,#0e2a5c,#1a4abf)',border:'2px solid #2a5fff',color:'#fff',padding:'13px',fontSize:14,fontWeight:'bold',borderRadius:12,cursor:'pointer',fontFamily:'inherit'}}>Rebuy ${buyInAmt?.toLocaleString()} →</button>}
              <button onClick={leaveTable} style={{flex:1,background:'transparent',border:'1px solid rgba(255,255,255,.12)',color:'#666',padding:'13px',fontSize:14,borderRadius:12,cursor:'pointer',fontFamily:'inherit'}}>Leave</button>
            </div>
          </div>
        ):gs.showdown?(
          <div style={{textAlign:'center',padding:'12px'}}>
            {gs.winnerIds.includes(0)
              ?<div style={{color:'#4cff8a',fontSize:14,fontWeight:'bold',animation:'pulse 1s infinite'}}>🏆 You win! Next hand coming…</div>
              :<div style={{color:'#555',fontSize:13}}>Next hand coming…</div>}
          </div>
        ):isMyTurn?(
          <div>
            {showRaise&&(
              <div style={{marginBottom:10,background:'rgba(0,0,0,.75)',border:'1px solid rgba(255,255,255,.09)',borderRadius:14,padding:'14px',animation:'fadeIn .2s'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <span style={{color:'#888',fontSize:13}}>Raise to:</span>
                  <span style={{color:'#f5c842',fontSize:24,fontWeight:900}}>{raiseAmt}</span>
                </div>
                <div style={{display:'flex',gap:6,marginBottom:10}}>
                  {[{l:'Min',v:minRA},{l:'½ Pot',v:Math.min(Math.floor(gs.pot*.5+gs.currentBet),h.stack+h.bet)},{l:'Pot',v:Math.min(gs.pot+gs.currentBet,h.stack+h.bet)},{l:'All-in',v:h.stack+h.bet}].map(({l,v})=>(
                    <button key={l} onClick={()=>setRaiseAmt(Math.max(minRA,Math.min(Math.floor(v),h.stack+h.bet)))} style={{flex:1,background:'rgba(245,200,66,.07)',color:'#f5c842',border:'1px solid rgba(245,200,66,.22)',borderRadius:8,padding:'6px 0',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>{l}</button>
                  ))}
                </div>
                <input type="range" min={minRA} max={h.stack+h.bet} value={raiseAmt} onChange={e=>setRaiseAmt(+e.target.value)} style={{width:'100%',marginBottom:12}}/>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setShowRaise(false)} style={{background:'#111',border:'1px solid #333',color:'#666',flex:1,padding:'11px 0',borderRadius:11,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:13}}>Cancel</button>
                  <button onClick={()=>heroAct('raise',raiseAmt)} style={{background:'#1c1200',border:'2px solid #f5c842',color:'#f5c842',flex:2,padding:'11px 0',borderRadius:11,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:14}}>Raise to {raiseAmt} ▶</button>
                </div>
              </div>
            )}
            {!showRaise&&(
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>heroAct('fold')} style={{background:'#1c0404',border:'2px solid #c0392b',color:'#ff6b6b',flex:1,padding:'15px 0',borderRadius:11,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:14}}>Fold</button>
                <button onClick={()=>heroAct(canCheck?'check':'call')} style={{background:'#011428',border:'2px solid #2980b9',color:'#5bc0ff',flex:1.5,padding:'15px 0',borderRadius:11,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:14}}>
                  {canCheck?'Check':`Call ${toCall}`}
                </button>
                {canRaise
                  ?<button onClick={()=>{setRaiseAmt(minRA);setShowRaise(true);}} style={{background:'#1a1100',border:'2px solid #d4ac0d',color:'#f5c842',flex:1,padding:'15px 0',borderRadius:11,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:14}}>Raise</button>
                  :h?.stack>0&&<button onClick={()=>heroAct('call')} style={{background:'#1a0800',border:'2px solid #ff8c00',color:'#ff8c00',flex:1,padding:'15px 0',borderRadius:11,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:14}}>All-in 🔥</button>
                }
              </div>
            )}
          </div>
        ):(
          <div style={{textAlign:'center',color:'#252525',fontSize:13,padding:'13px'}}>
            {h?.allIn?'⏳ You\'re all-in — running it out…':h?.folded?'You folded…':gs.allInReveal?'⚡ Revealing cards…':'Waiting for opponents…'}
          </div>
        )}
      </div>
    </div>
  );
}
