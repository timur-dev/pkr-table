import { useState, useEffect, useRef } from "react";

// ── STORAGE (works in real app, silently fails in sandbox) ───────────────────
const store = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch(e) { return null; } },
  set: (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} },
};

// ── DECK & CARDS ─────────────────────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV = Object.fromEntries(RANKS.map((r,i) => [r, i+2]));
const isRed = s => s==='♥' || s==='♦';
const SB_A = 25, BB_A = 50;
const COMM_N = { preflop:0, flop:3, turn:4, river:5 };

const mkDeck = () => { const d=[]; SUITS.forEach(s=>RANKS.forEach(r=>d.push({r,s}))); return d; };
const shuf = a => { const d=[...a]; for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];} return d; };

// ── HAND EVAL ────────────────────────────────────────────────────────────────
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

// ── SIDE POTS ────────────────────────────────────────────────────────────────
const calcPots = players => {
  let rem=players.map(p=>({id:p.id,bet:p.totalBet||0,folded:p.folded}));
  const pots=[];
  while(rem.some(r=>r.bet>0)){
    const min=Math.min(...rem.filter(r=>r.bet>0).map(r=>r.bet));
    const amt=rem.reduce((s,r)=>s+Math.min(r.bet,min),0);
    const elig=rem.filter(r=>r.bet>=min&&!r.folded).map(r=>r.id);
    if(amt>0) pots.push({amount:amt,eligible:elig.length>0?elig:rem.filter(r=>r.bet>=min).map(r=>r.id)});
    rem=rem.map(r=>({...r,bet:Math.max(0,r.bet-min)}));
  }
  return pots;
};
const getWinnersFrom = (ids,players,comm) => {
  const elig=players.filter(p=>ids.includes(p.id)&&!p.folded);
  if(!elig.length) return ids.slice(0,1);
  if(elig.length===1) return [elig[0].id];
  const hs=elig.map(p=>({id:p.id,h:bestH(p.cards,comm)}));
  let bst=hs[0];
  for(const h of hs.slice(1)) if(h.h&&(!bst.h||h.h.rank>bst.h.rank||(h.h.rank===bst.h.rank&&cmpA(h.h.tb,bst.h.tb)>0))) bst=h;
  return hs.filter(h=>h.h&&bst.h&&h.h.rank===bst.h.rank&&cmpA(h.h.tb,bst.h.tb)===0).map(h=>h.id);
};

// ── HAND STRENGTH ────────────────────────────────────────────────────────────
const getStrength = (cards,comm) => {
  if(!comm||!comm.length){
    const v1=RV[cards[0].r],v2=RV[cards[1].r];
    if(v1===v2) return v1>=10?{txt:'Premium Pair! 🔥',clr:'#4cff8a',pct:88}:{txt:'Pocket Pair',clr:'#7ee8a2',pct:68};
    const hi=Math.max(v1,v2),lo=Math.min(v1,v2);
    if(hi>=13&&lo>=10) return {txt:'Strong Hand 💪',clr:'#4cff8a',pct:78};
    if(hi===14) return {txt:'Ace High',clr:'#a0e0ff',pct:62};
    if(hi>=11&&Math.abs(v1-v2)<=2) return {txt:'Connected',clr:'#a0e0ff',pct:52};
    if(lo>=9) return {txt:'Decent Hand',clr:'#f5c842',pct:40};
    return {txt:'Weak Hand',clr:'#ff7070',pct:18};
  }
  const h=bestH(cards,comm); if(!h) return {txt:'—',clr:'#555',pct:0};
  const p=[10,32,48,62,74,82,88,93,97,100];
  return {txt:h.name,clr:h.rank>=5?'#4cff8a':h.rank>=3?'#f5c842':'#ff9060',pct:p[h.rank]||0};
};

// ── AI ───────────────────────────────────────────────────────────────────────
const aiDecide = (p,gs) => {
  if(p.stack===0) return {action:'call'};
  const h=bestH(p.cards,gs.community),rank=h?h.rank:-1;
  const toCall=Math.max(0,gs.currentBet-p.bet),potOdds=gs.pot>0?toCall/(gs.pot+toCall):0,r=Math.random();
  const raise=m=>({action:'raise',raiseTo:Math.min(Math.floor(m),p.stack+p.bet)});
  if(gs.street==='preflop'){
    const v1=RV[p.cards[0].r],v2=RV[p.cards[1].r],hi=Math.max(v1,v2),lo=Math.min(v1,v2);
    const s=v1===v2&&v1>=10?4:v1===v2?3:hi>=13&&lo>=10?3:hi>=10&&lo>=9?2:Math.abs(v1-v2)<=2?1:0;
    if(s>=4) return r<.55?raise(gs.currentBet*3):{action:'call'};
    if(s>=3) return toCall===0?(r<.4?raise(gs.currentBet*2.5):{action:'check'}):(r<.72?{action:'call'}:raise(gs.currentBet*2.5));
    if(s>=2) return toCall===0?{action:'check'}:(r<.62?{action:'call'}:{action:'fold'});
    if(s>=1) return toCall===0?{action:'check'}:(potOdds<.28&&r<.5?{action:'call'}:{action:'fold'});
    return toCall===0?{action:'check'}:(potOdds<.18&&r<.28?{action:'call'}:{action:'fold'});
  }
  if(rank>=7) return r<.55?raise(gs.pot):{action:'call'};
  if(rank>=5) return r<.5?raise(gs.pot*.75):{action:'call'};
  if(rank>=3) return toCall===0?(r<.38?raise(gs.pot*.5):{action:'check'}):(r<.62?{action:'call'}:r<.78?raise(gs.pot*.5):{action:'fold'});
  if(rank>=1) return toCall===0?{action:'check'}:(potOdds<.32?{action:'call'}:{action:'fold'});
  return toCall===0?{action:'check'}:(potOdds<.18&&r<.22?{action:'call'}:{action:'fold'});
};

// ── GAME INIT ────────────────────────────────────────────────────────────────
const mkRound = (stacks, dIdx, heroName, buyIn) => {
  const PI = [{id:0,name:heroName||'You',emoji:'🎯',isHero:true},{id:1,name:'Ace',emoji:'🤖',isHero:false},{id:2,name:'Nova',emoji:'⚡',isHero:false}];
  const deck=shuf(mkDeck()); let di=0;
  const cards=[[],[],[]];
  for(let r=0;r<2;r++) for(let p=0;p<3;p++) cards[p].push(deck[di++]);
  di++;
  const comm5=[deck[di++],deck[di++],deck[di++]]; di++; comm5.push(deck[di++]); di++; comm5.push(deck[di++]);
  const sbI=(dIdx+1)%3, bbI=(dIdx+2)%3;
  const players=PI.map((pi,i)=>{
    const dead=stacks[i]===0;
    const blind=dead?0:i===sbI?Math.min(SB_A,stacks[i]):i===bbI?Math.min(BB_A,stacks[i]):0;
    return {...pi,stack:Math.max(0,stacks[i]-blind),cards:cards[i],bet:blind,totalBet:blind,folded:dead,busted:dead,lastAct:dead?'OUT':i===sbI?'SB':i===bbI?'BB':'',allIn:!dead&&stacks[i]===blind&&blind>0};
  });
  const pot=players.reduce((s,p)=>s+p.bet,0);
  const nta=new Set(players.filter(p=>!p.busted&&!p.allIn).map(p=>p.id));
  let fa=dIdx; for(let i=0;i<3;i++){const idx=(dIdx+i)%3;if(!players[idx].busted){fa=idx;break;}}
  return {players,comm5,community:[],pot,currentBet:BB_A,minRaise:BB_A,street:'preflop',actingIdx:fa,dealerIdx:dIdx,needToAct:nta,winnerIds:[],showdown:false,handNames:{},potWins:{},turnId:0,debugLog:['Round started'],buyIn};
};

const doAction = (gs,pid,action,raiseTo) => {
  const ps=gs.players.map(p=>({...p})); const p=ps[pid];
  let pot=gs.pot,cb=gs.currentBet,mr=gs.minRaise,nta=new Set(gs.needToAct);
  if(action==='fold'){p.folded=true;p.lastAct='Fold ✗';nta.delete(pid);}
  else if(action==='check'||action==='call'){
    const tc=Math.max(0,cb-p.bet);
    if(tc>0){const amt=Math.min(tc,p.stack);p.stack-=amt;p.bet+=amt;p.totalBet+=amt;pot+=amt;if(p.stack===0){p.allIn=true;p.lastAct='All-in 🔥';}else p.lastAct='Call';}
    else p.lastAct='Check';
    nta.delete(pid);
  } else if(action==='raise'){
    const rt=raiseTo||cb+mr,diff=Math.max(0,rt-p.bet),amt=Math.min(diff,p.stack),nb=p.bet+amt;
    mr=Math.max(mr,nb-cb);cb=nb;p.stack-=amt;p.bet=nb;p.totalBet+=amt;pot+=amt;
    if(p.stack===0){p.allIn=true;p.lastAct='All-in 🔥';}else p.lastAct=`Raise ${nb}`;
    nta=new Set(ps.filter(x=>!x.folded&&!x.busted&&!x.allIn&&x.id!==pid).map(x=>x.id));
  }
  const dbg=[...(gs.debugLog||[]),`${ps[pid].name}: ${action} | nta:[${[...nta].join(',')}] pot:${pot}`].slice(-10);
  let ngs={...gs,players:ps,pot,currentBet:cb,minRaise:mr,needToAct:nta,debugLog:dbg,turnId:(gs.turnId||0)+1};
  if(ps.filter(p=>!p.folded).length===1) return resolveHand(ngs,false);
  if(nta.size===0) return advStreet(ngs);
  let nx=(pid+1)%3;
  for(let i=0;i<3;i++){const idx=(pid+1+i)%3;if(!ps[idx].folded&&!ps[idx].busted&&nta.has(idx)){nx=idx;break;}}
  return {...ngs,actingIdx:nx,debugLog:[...dbg,`→ next: ${ps[nx].name}`].slice(-10)};
};

const advStreet = gs => {
  const ord=['preflop','flop','turn','river','showdown'];
  const nxt=ord[ord.indexOf(gs.street)+1];
  if(nxt==='showdown') return resolveHand({...gs,community:gs.comm5,showdown:true},true);
  const comm=gs.comm5.slice(0,COMM_N[nxt]);
  const ps=gs.players.map(p=>({...p,bet:0,lastAct:p.busted||p.folded||p.allIn?p.lastAct:''}));
  let fa=(gs.dealerIdx+1)%3;
  for(let i=0;i<3;i++){const idx=(gs.dealerIdx+1+i)%3;if(!ps[idx].folded&&!ps[idx].busted){fa=idx;break;}}
  const canAct=ps.filter(p=>!p.folded&&!p.busted&&!p.allIn);
  const newGs={...gs,players:ps,community:comm,street:nxt,currentBet:0,minRaise:BB_A,actingIdx:fa,needToAct:new Set(canAct.map(p=>p.id)),turnId:(gs.turnId||0)+1,debugLog:[...(gs.debugLog||[]),`→ Street: ${nxt}`].slice(-10)};
  if(canAct.length===0) return advStreet(newGs);
  return newGs;
};

const resolveHand = (gs,sd) => {
  const pots=calcPots(gs.players),ps=gs.players.map(p=>({...p}));
  const allW=new Set(),potWins={};
  for(const pot of pots){
    const elig=ps.filter(p=>pot.eligible.includes(p.id)&&!p.folded);
    let ws=!elig.length?[pot.eligible[0]]:elig.length===1||!sd?[elig[0].id]:getWinnersFrom(pot.eligible,ps,gs.comm5);
    const share=Math.floor(pot.amount/ws.length),rem=pot.amount-share*ws.length;
    ws.forEach((id,i)=>{const g=share+(i===0?rem:0);ps[id].stack+=g;potWins[id]=(potWins[id]||0)+g;allW.add(id);});
  }
  const hn={};
  if(sd) ps.filter(p=>!p.folded).forEach(p=>{const h=bestH(p.cards,gs.comm5);if(h) hn[p.id]=h.name;});
  return {...gs,players:ps,pot:0,winnerIds:[...allW],street:'showdown',community:gs.comm5,showdown:true,handNames:hn,potWins};
};

// ── CARD COMPONENT ────────────────────────────────────────────────────────────
function Card({card,faceDown,sm,glow}){
  const w=sm?40:50,h=sm?58:72;
  const base={width:w,height:h,borderRadius:8,flexShrink:0};
  if(faceDown) return (
    <div style={{...base,background:'linear-gradient(145deg,#1c3f96,#0b1e5c)',border:'2px solid #3060f0',boxShadow:`0 4px 14px rgba(0,0,0,.8)${glow?',0 0 20px rgba(80,130,255,.5)':''}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:w-14,height:h-14,border:'1.5px solid rgba(100,150,255,.3)',borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(100,150,255,.4)',fontSize:18}}>★</div>
    </div>
  );
  const red=isRed(card.s),clr=red?'#d41515':'#111';
  return (
    <div style={{...base,background:'#fefefe',border:'1.5px solid #ccc',boxShadow:`0 4px 14px rgba(0,0,0,.8)${glow?',0 0 18px rgba(255,200,50,.8)':''}`,padding:'3px 5px',display:'flex',flexDirection:'column',position:'relative',overflow:'hidden'}}>
      <div style={{fontSize:sm?12:14,fontWeight:'bold',color:clr,lineHeight:1.15}}>{card.r}</div>
      <div style={{fontSize:sm?14:18,color:clr,lineHeight:1}}>{card.s}</div>
      <div style={{position:'absolute',bottom:2,right:3,fontSize:sm?20:26,color:clr,opacity:.65,transform:'rotate(180deg)'}}>{card.s}</div>
    </div>
  );
}

function StrBar({cards,comm}){
  const s=getStrength(cards,comm);
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:5}}>
      <div style={{flex:1,height:5,background:'rgba(255,255,255,.08)',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${s.pct}%`,background:s.clr,borderRadius:3,transition:'width .6s ease'}}/>
      </div>
      <div style={{color:s.clr,fontSize:10,fontWeight:'bold',minWidth:110,textAlign:'right'}}>{s.txt}</div>
    </div>
  );
}

function PPanel({p,isAct,isDealer,showCards,isWinner,won,showdown,handName}){
  return (
    <div style={{flex:1,background:isWinner?'rgba(76,255,138,.07)':'rgba(4,10,22,.95)',border:`2px solid ${isAct?'#f5c842':isWinner?'#4cff8a':p.allIn?'rgba(255,140,0,.5)':'rgba(255,255,255,.09)'}`,borderRadius:14,padding:'10px',opacity:p.busted?.25:p.folded?.38:1,animation:isAct?'glow 1.4s infinite':isWinner?'winGlow 1.4s infinite':'none',transition:'all .3s'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7}}>
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <span style={{fontSize:20}}>{p.emoji}</span>
          <div>
            <div style={{fontSize:12,fontWeight:'bold',color:p.busted?'#444':'#fff'}}>{p.name}</div>
            <div style={{color:'#f5c842',fontSize:11}}>💰{p.stack}</div>
          </div>
        </div>
        {isDealer&&<div style={{background:'#f5c842',color:'#000',borderRadius:'50%',width:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:900}}>D</div>}
      </div>
      <div style={{display:'flex',gap:3,justifyContent:'center',marginBottom:5}}>
        {p.cards.map((c,i)=><Card key={i} card={c} faceDown={!showCards} sm glow={isWinner}/>)}
      </div>
      <div style={{textAlign:'center',minHeight:15,fontSize:11}}>
        {p.allIn&&!showdown&&<span style={{color:'#ff8c00',fontWeight:'bold'}}>ALL IN 🔥</span>}
        {!p.allIn&&p.bet>0&&<span style={{color:'#7ee8a2'}}>Bet {p.bet}</span>}
        {!p.bet&&!p.allIn&&p.lastAct&&<span style={{color:'#555'}}>{p.lastAct}</span>}
      </div>
      {handName&&<div style={{color:'#f5c842',fontSize:10,textAlign:'center',fontWeight:'bold',animation:'fadeIn .4s'}}>{handName}</div>}
      {isWinner&&won>0&&<div style={{color:'#4cff8a',fontSize:12,textAlign:'center',fontWeight:'bold',marginTop:2,animation:'fadeIn .4s'}}>🏆 +{won}</div>}
      {p.busted&&<div style={{color:'#333',fontSize:10,textAlign:'center',letterSpacing:1,fontWeight:'bold',marginTop:2}}>ELIMINATED</div>}
    </div>
  );
}

// ── STYLES ───────────────────────────────────────────────────────────────────
const CSS = `
  *{box-sizing:border-box}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
  @keyframes glow{0%,100%{box-shadow:0 0 6px rgba(245,200,66,.2)}50%{box-shadow:0 0 24px rgba(245,200,66,.7)}}
  @keyframes winGlow{0%,100%{box-shadow:0 0 8px rgba(76,255,138,.2)}50%{box-shadow:0 0 26px rgba(76,255,138,.7)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
  @keyframes dealCard{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
  input{outline:none;font-family:inherit}
  input[type=range]{-webkit-appearance:none;appearance:none;height:6px;border-radius:3px;background:rgba(255,255,255,.12)}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#f5c842;cursor:pointer;border:2px solid #000}
`;

const DARK = 'linear-gradient(160deg,#07101d,#0d1a2e)';

// ── MAIN APP ─────────────────────────────────────────────────────────────────
const STARTING_BALANCE = 10000;
const BUY_INS = [
  {amount:500,  label:'$500',  mult:'3×', prize:'$1,500', color:'#4a8fff'},
  {amount:1000, label:'$1,000',mult:'3×', prize:'$3,000', color:'#f5c842'},
  {amount:2000, label:'$2,000',mult:'3×', prize:'$6,000', color:'#ff6b35'},
];

export default function App(){
  // ── Account state ──────────────────────────────────────────────────────────
  const [account, setAccount] = useState(()=>store.get('pokerAccount')||null);
  const [authMode, setAuthMode] = useState('login'); // login | register
  const [authForm, setAuthForm] = useState({username:'',password:''});
  const [authError, setAuthError] = useState('');

  // ── Game state ─────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState('auth'); // auth | lobby | playing | result
  const [selectedBuyIn, setSelectedBuyIn] = useState(null);
  const [gs, setGs] = useState(null);
  const [raiseAmt, setRaiseAmt] = useState(100);
  const [showRaise, setShowRaise] = useState(false);
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null); // {won, amount, prize}
  const tmr = useRef(null);

  const addLog = msg => setLog(l=>[msg,...l].slice(0,5));

  // Restore session
  useEffect(()=>{
    if(account) setScreen('lobby');
  },[]);

  const saveAccount = acc => {
    store.set('pokerAccount', acc);
    setAccount(acc);
  };

  // ── AUTH ───────────────────────────────────────────────────────────────────
  const handleAuth = () => {
    if(!authForm.username.trim()){setAuthError('Enter a username');return;}
    if(authForm.password.length<4){setAuthError('Password must be 4+ characters');return;}
    const accounts = store.get('pokerAccounts')||{};
    if(authMode==='register'){
      if(accounts[authForm.username]){setAuthError('Username taken');return;}
      const newAcc={username:authForm.username,password:authForm.password,balance:STARTING_BALANCE,gamesPlayed:0,gamesWon:0};
      accounts[authForm.username]=newAcc;
      store.set('pokerAccounts',accounts);
      saveAccount(newAcc);
    } else {
      const acc=accounts[authForm.username];
      if(!acc||acc.password!==authForm.password){setAuthError('Invalid username or password');return;}
      saveAccount(acc);
    }
    setAuthError('');
    setScreen('lobby');
  };

  const logout = () => {
    store.set('pokerAccount',null);
    setAccount(null);
    setScreen('auth');
    setGs(null);
  };

  // ── START GAME ─────────────────────────────────────────────────────────────
  const startGame = (buyIn) => {
    if(!account||account.balance<buyIn.amount){return;}
    const newBalance = account.balance - buyIn.amount;
    const updated = {...account, balance:newBalance, gamesPlayed:account.gamesPlayed+1};
    saveAccount(updated);
    const accounts=store.get('pokerAccounts')||{};
    accounts[account.username]=updated;
    store.set('pokerAccounts',accounts);
    setSelectedBuyIn(buyIn);
    setGs(mkRound([buyIn.amount,buyIn.amount,buyIn.amount],0,account.username,buyIn.amount));
    setScreen('playing');
    setShowRaise(false);
    setLog([]);
  };

  // ── AI TURNS (fixed: uses turnId) ─────────────────────────────────────────
  useEffect(()=>{
    if(!gs||gs.showdown) return;
    const actor=gs.players[gs.actingIdx];
    if(!actor||actor.isHero||actor.folded||actor.busted||actor.allIn) return;
    addLog(`${actor.name} thinking…`);
    tmr.current=setTimeout(()=>{
      const{action,raiseTo}=aiDecide(actor,gs);
      addLog(`${actor.name}: ${action}${raiseTo?` → ${raiseTo}`:''}`);
      setGs(prev=>doAction(prev,actor.id,action,raiseTo));
    },700+Math.random()*900);
    return ()=>clearTimeout(tmr.current);
  },[gs?.turnId]);

  // ── ALL-IN RUNOUT ──────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!gs||gs.showdown||gs.needToAct.size>0) return;
    const canAct=gs.players.filter(p=>!p.folded&&!p.busted&&!p.allIn);
    if(canAct.length===0){
      addLog('All-in — running it out…');
      tmr.current=setTimeout(()=>setGs(prev=>advStreet(prev)),800);
      return ()=>clearTimeout(tmr.current);
    }
  },[gs?.turnId,gs?.needToAct?.size]);

  // ── GAME OVER CHECK ────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!gs?.showdown) return;
    const alive=gs.players.filter(p=>p.stack>0);
    if(alive.length===1){
      setTimeout(()=>{
        const heroWon=alive[0].isHero;
        const prize=heroWon?gs.potWins?.[0]||0:0;
        if(heroWon){
          const updated={...account,balance:account.balance+prize,gamesWon:account.gamesWon+1};
          const accounts=store.get('pokerAccounts')||{};
          accounts[account.username]=updated;
          store.set('pokerAccounts',accounts);
          saveAccount(updated);
        }
        setResult({won:heroWon,prize,buyIn:selectedBuyIn?.amount});
        setScreen('result');
      },2200);
    }
  },[gs?.showdown]);

  const nextHand = () => {
    if(!gs) return;
    const stacks=gs.players.map(p=>p.stack);
    if(stacks.filter(s=>s>0).length<2){return;}
    let nd=(gs.dealerIdx+1)%3;
    for(let i=0;i<3;i++){const idx=(nd+i)%3;if(stacks[idx]>0){nd=idx;break;}}
    setGs(mkRound(stacks,nd,account?.username,gs.buyIn));
    setShowRaise(false);setLog([]);
  };

  const heroAct=(action,rt)=>{
    if(!gs||gs.showdown||gs.actingIdx!==0) return;
    const h=gs.players[0];if(h.folded||h.busted) return;
    addLog(`You: ${action}${rt?` → ${rt}`:''}`);
    setGs(prev=>doAction(prev,0,action,rt));
    setShowRaise(false);
  };

  const h=gs?.players[0];
  const isMyTurn=gs&&!gs.showdown&&gs.actingIdx===0&&h&&!h.folded&&!h.busted&&!h.allIn;
  const toCall=h&&gs?Math.min(Math.max(0,gs.currentBet-h.bet),h.stack):0;
  const canCheck=h&&gs&&gs.currentBet<=h.bet;
  const minRA=gs&&h?Math.min(gs.currentBet+gs.minRaise,h.stack+h.bet):100;
  const canRaise=h&&gs&&h.stack>toCall&&(h.stack+h.bet)>gs.currentBet;
  const hasSidePot=gs&&calcPots(gs.players).length>1;

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN: AUTH
  // ════════════════════════════════════════════════════════════════════════════
  if(screen==='auth') return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'"Inter",system-ui,sans-serif',padding:'0 24px'}}>
      <style>{CSS}</style>
      <div style={{width:'100%',maxWidth:380,animation:'slideUp .4s ease'}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:52,marginBottom:6}}>🃏</div>
          <div style={{color:'#f5c842',fontSize:30,fontWeight:900,letterSpacing:3}}>SPIN & GO</div>
          <div style={{color:'#444',fontSize:12,letterSpacing:2,marginTop:4}}>TEXAS HOLD'EM · ONLINE</div>
        </div>

        <div style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.08)',borderRadius:20,padding:28}}>
          {/* Tab toggle */}
          <div style={{display:'flex',background:'rgba(0,0,0,.3)',borderRadius:10,marginBottom:24,padding:3}}>
            {['login','register'].map(m=>(
              <button key={m} onClick={()=>{setAuthMode(m);setAuthError('');}} style={{flex:1,padding:'10px',borderRadius:8,border:'none',background:authMode===m?'rgba(245,200,66,.15)':'transparent',color:authMode===m?'#f5c842':'#555',fontWeight:'bold',fontSize:14,cursor:'pointer',fontFamily:'inherit',textTransform:'capitalize',transition:'all .2s'}}>
                {m==='login'?'Login':'Register'}
              </button>
            ))}
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div>
              <div style={{color:'#888',fontSize:11,marginBottom:5,letterSpacing:1}}>USERNAME</div>
              <input value={authForm.username} onChange={e=>setAuthForm(f=>({...f,username:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAuth()} placeholder="Enter username" style={{width:'100%',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:10,padding:'12px 14px',color:'#fff',fontSize:14}}/>
            </div>
            <div>
              <div style={{color:'#888',fontSize:11,marginBottom:5,letterSpacing:1}}>PASSWORD</div>
              <input type="password" value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAuth()} placeholder="Enter password" style={{width:'100%',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:10,padding:'12px 14px',color:'#fff',fontSize:14}}/>
            </div>
            {authError&&<div style={{color:'#ff6b6b',fontSize:12,textAlign:'center',background:'rgba(255,0,0,.08)',padding:'8px',borderRadius:8}}>{authError}</div>}
            {authMode==='register'&&<div style={{color:'#4a8',fontSize:11,textAlign:'center'}}>🎁 New players receive $10,000 starting balance</div>}
            <button onClick={handleAuth} style={{background:'linear-gradient(135deg,#b8900a,#f5c842)',border:'none',color:'#000',padding:'14px',fontSize:15,fontWeight:'bold',borderRadius:12,cursor:'pointer',fontFamily:'inherit',marginTop:4}}>
              {authMode==='login'?'Login →':'Create Account →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN: LOBBY
  // ════════════════════════════════════════════════════════════════════════════
  if(screen==='lobby') return (
    <div style={{minHeight:'100vh',background:DARK,fontFamily:'"Inter",system-ui,sans-serif',color:'#fff'}}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{background:'rgba(0,0,0,.4)',borderBottom:'1px solid rgba(255,255,255,.06)',padding:'14px 20px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{color:'#f5c842',fontWeight:800,fontSize:14,letterSpacing:1}}>🎰 SPIN & GO</div>
          <div style={{color:'#555',fontSize:10,letterSpacing:1}}>TEXAS HOLD'EM</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{color:'#fff',fontSize:13,fontWeight:'bold'}}>👤 {account?.username}</div>
          <div style={{color:'#f5c842',fontSize:12}}>Balance: ${account?.balance?.toLocaleString()}</div>
        </div>
        <button onClick={logout} style={{background:'transparent',border:'1px solid rgba(255,255,255,.15)',color:'#666',padding:'6px 12px',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:12}}>Logout</button>
      </div>

      <div style={{padding:'24px 20px',maxWidth:480,margin:'0 auto'}}>
        {/* Stats */}
        <div style={{display:'flex',gap:10,marginBottom:28}}>
          {[{l:'Balance',v:`$${account?.balance?.toLocaleString()}`,c:'#f5c842'},{l:'Games',v:account?.gamesPlayed||0,c:'#a0e0ff'},{l:'Wins',v:account?.gamesWon||0,c:'#4cff8a'}].map(s=>(
            <div key={s.l} style={{flex:1,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.07)',borderRadius:14,padding:'14px 10px',textAlign:'center'}}>
              <div style={{color:s.c,fontSize:16,fontWeight:'bold'}}>{s.v}</div>
              <div style={{color:'#555',fontSize:10,marginTop:3,letterSpacing:1}}>{s.l}</div>
            </div>
          ))}
        </div>

        <div style={{color:'#888',fontSize:11,letterSpacing:2,textTransform:'uppercase',marginBottom:16}}>Choose Buy-in</div>

        {/* Buy-in cards */}
        <div style={{display:'flex',flexDirection:'column',gap:12,marginBottom:28}}>
          {BUY_INS.map(b=>{
            const canAfford=account?.balance>=b.amount;
            return (
              <button key={b.amount} onClick={()=>canAfford&&startGame(b)} style={{background:canAfford?`rgba(${b.color==='#4a8fff'?'74,143,255':b.color==='#f5c842'?'245,200,66':'255,107,53'},.06)`:'rgba(255,255,255,.02)',border:`2px solid ${canAfford?b.color:'rgba(255,255,255,.08)'}`,borderRadius:16,padding:'18px 20px',cursor:canAfford?'pointer':'not-allowed',fontFamily:'inherit',opacity:canAfford?1:.45,transition:'all .2s',display:'flex',justifyContent:'space-between',alignItems:'center',textAlign:'left'}}>
                <div>
                  <div style={{color:canAfford?b.color:'#555',fontSize:22,fontWeight:900}}>{b.label}</div>
                  <div style={{color:'#666',fontSize:11,marginTop:3}}>Buy-in · 3 players</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{color:'#fff',fontSize:18,fontWeight:'bold'}}>{b.prize}</div>
                  <div style={{color:canAfford?b.color:'#555',fontSize:12,marginTop:2}}>{b.mult} Prize Pool</div>
                </div>
              </button>
            );
          })}
        </div>

        {account?.balance<500&&(
          <div style={{background:'rgba(255,100,100,.08)',border:'1px solid rgba(255,100,100,.2)',borderRadius:12,padding:'14px',textAlign:'center',color:'#ff8888',fontSize:13}}>
            ⚠️ Insufficient balance. Deposit to continue playing.
            <div style={{marginTop:8}}><button style={{background:'rgba(255,100,100,.15)',border:'1px solid #ff6b6b',color:'#ff8888',padding:'8px 16px',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:12}}>Add Funds (Coming Soon)</button></div>
          </div>
        )}

        <div style={{color:'#2a3a2a',fontSize:10,textAlign:'center',marginTop:16,letterSpacing:1}}>
          🔒 Secure · Certified RNG · Licensed Platform
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN: RESULT
  // ════════════════════════════════════════════════════════════════════════════
  if(screen==='result') return (
    <div style={{minHeight:'100vh',background:DARK,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'"Inter",system-ui,sans-serif',padding:'0 24px',textAlign:'center'}}>
      <style>{CSS}</style>
      <div style={{animation:'slideUp .4s ease',maxWidth:360,width:'100%'}}>
        <div style={{fontSize:72,marginBottom:12,animation:'pulse 1.5s infinite'}}>{result?.won?'🏆':'💀'}</div>
        <div style={{color:result?.won?'#f5c842':'#777',fontSize:32,fontWeight:900,marginBottom:8}}>{result?.won?'YOU WIN!':'YOU LOST'}</div>

        {result?.won?(
          <div style={{background:'rgba(76,255,138,.08)',border:'1px solid rgba(76,255,138,.2)',borderRadius:16,padding:20,marginBottom:24}}>
            <div style={{color:'#4cff8a',fontSize:13,marginBottom:4}}>Prize won</div>
            <div style={{color:'#4cff8a',fontSize:40,fontWeight:900}}>+${result.prize?.toLocaleString()}</div>
            <div style={{color:'#888',fontSize:12,marginTop:6}}>New balance: ${account?.balance?.toLocaleString()}</div>
          </div>
        ):(
          <div style={{background:'rgba(255,100,100,.06)',border:'1px solid rgba(255,100,100,.15)',borderRadius:16,padding:20,marginBottom:24}}>
            <div style={{color:'#ff8888',fontSize:13,marginBottom:4}}>Buy-in lost</div>
            <div style={{color:'#ff8888',fontSize:36,fontWeight:900}}>-${result?.buyIn?.toLocaleString()}</div>
            <div style={{color:'#888',fontSize:12,marginTop:6}}>Remaining balance: ${account?.balance?.toLocaleString()}</div>
          </div>
        )}

        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>setScreen('lobby')} style={{flex:1,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',color:'#aaa',padding:'14px',fontSize:14,fontWeight:'bold',borderRadius:12,cursor:'pointer',fontFamily:'inherit'}}>← Lobby</button>
          {selectedBuyIn&&account?.balance>=selectedBuyIn.amount&&(
            <button onClick={()=>startGame(selectedBuyIn)} style={{flex:2,background:'linear-gradient(135deg,#b8900a,#f5c842)',border:'none',color:'#000',padding:'14px',fontSize:14,fontWeight:'bold',borderRadius:12,cursor:'pointer',fontFamily:'inherit'}}>Play Again →</button>
          )}
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN: PLAYING
  // ════════════════════════════════════════════════════════════════════════════
  if(!gs) return null;
  const p1=gs.players[1],p2=gs.players[2];

  return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:DARK,fontFamily:'"Inter",system-ui,sans-serif',display:'flex',flexDirection:'column',color:'#fff'}}>
      <style>{CSS}</style>

      {/* Top bar */}
      <div style={{background:'rgba(0,0,0,.5)',borderBottom:'1px solid rgba(255,255,255,.06)',padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <div>
          <div style={{color:'#f5c842',fontWeight:800,fontSize:13,letterSpacing:1}}>🎰 SPIN & GO</div>
          <div style={{color:'#333',fontSize:9,letterSpacing:1}}>BLINDS 25/50</div>
        </div>
        <div style={{textAlign:'center'}}>
          <div style={{color:'#fff',fontSize:14,fontWeight:'bold'}}>Prize: <span style={{color:'#f5c842'}}>${(gs.buyIn*3)?.toLocaleString()}</span></div>
          <div style={{color:'#444',fontSize:10}}>Buy-in: ${gs.buyIn?.toLocaleString()}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{color:'#f5c842',fontSize:11,fontWeight:'bold',background:'rgba(245,200,66,.1)',padding:'4px 12px',borderRadius:20,border:'1px solid rgba(245,200,66,.2)',letterSpacing:1}}>{gs.street.toUpperCase()}</div>
          <div style={{color:'#333',fontSize:9,marginTop:2}}>💰${account?.balance?.toLocaleString()}</div>
        </div>
      </div>

      {/* AI players */}
      <div style={{display:'flex',gap:8,padding:'10px 10px 0'}}>
        <PPanel p={p1} isAct={!gs.showdown&&gs.actingIdx===1&&!p1.folded&&!p1.busted} isDealer={gs.dealerIdx===1} showCards={gs.showdown&&!p1.busted} isWinner={gs.winnerIds.includes(1)} won={gs.potWins?.[1]} showdown={gs.showdown} handName={gs.handNames[1]}/>
        <PPanel p={p2} isAct={!gs.showdown&&gs.actingIdx===2&&!p2.folded&&!p2.busted} isDealer={gs.dealerIdx===2} showCards={gs.showdown&&!p2.busted} isWinner={gs.winnerIds.includes(2)} won={gs.potWins?.[2]} showdown={gs.showdown} handName={gs.handNames[2]}/>
      </div>

      {/* Felt */}
      <div style={{margin:'10px',background:'radial-gradient(ellipse at 50% 40%,#175f2d 0%,#0b3f1d 55%,#061e0c 100%)',borderRadius:28,border:'7px solid #4a2900',outline:'2px solid #7a4d00',padding:'16px 10px 14px',display:'flex',flexDirection:'column',alignItems:'center',gap:10,boxShadow:'inset 0 0 60px rgba(0,0,0,.8)',flexShrink:0}}>
        <div style={{display:'flex',gap:5}}>
          {[0,1,2,3,4].map(i=>(
            gs.community[i]
              ?<div key={i} style={{animation:'dealCard .35s ease'}}><Card card={gs.community[i]} faceDown={false}/></div>
              :<div key={i} style={{width:50,height:72,borderRadius:8,border:'1.5px dashed rgba(255,255,255,.08)',background:'rgba(0,0,0,.1)'}}/>
          ))}
        </div>
        <div style={{background:'rgba(0,0,0,.6)',border:'1px solid rgba(245,200,66,.3)',borderRadius:20,padding:'5px 20px',color:'#f5c842',fontSize:15,fontWeight:'bold',minHeight:30,display:'flex',alignItems:'center'}}>
          {gs.pot>0?`💰 POT: ${gs.pot}`:gs.showdown?'✓ Pot Resolved':'—'}
        </div>
        {gs.players.some(p=>p.allIn)&&hasSidePot&&(
          <div style={{color:'#ff8c00',fontSize:10,letterSpacing:1,fontWeight:'bold'}}>⚡ SIDE POT ACTIVE</div>
        )}
      </div>

      {/* Hero */}
      <div style={{margin:'0 10px',flex:1}}>
        {h&&(
          <div style={{background:gs.winnerIds.includes(0)?'rgba(76,255,138,.08)':'rgba(4,10,22,.95)',border:`2px solid ${isMyTurn?'#f5c842':gs.winnerIds.includes(0)?'#4cff8a':h.allIn?'rgba(255,140,0,.6)':'rgba(255,255,255,.1)'}`,borderRadius:14,padding:'12px 14px',opacity:h.folded?.35:1,animation:isMyTurn?'glow 1.4s infinite':gs.winnerIds.includes(0)?'winGlow 1.4s infinite':'none',transition:'all .3s'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:24}}>🎯</span>
                <div>
                  <div style={{fontSize:14,fontWeight:'bold'}}>{h.name}</div>
                  <div style={{color:'#f5c842',fontSize:12}}>💰 {h.stack}</div>
                </div>
              </div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                {gs.dealerIdx===0&&<div style={{background:'#f5c842',color:'#000',borderRadius:'50%',width:21,height:21,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900}}>D</div>}
                {isMyTurn&&<div style={{color:'#f5c842',fontSize:11,fontWeight:'bold',animation:'pulse 1s infinite'}}>YOUR TURN</div>}
                {h.allIn&&<div style={{color:'#ff8c00',fontSize:11,fontWeight:'bold'}}>ALL IN 🔥</div>}
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
            {gs.winnerIds.includes(0)&&gs.potWins?.[0]&&<div style={{color:'#4cff8a',fontSize:14,textAlign:'center',fontWeight:'bold',marginTop:4,animation:'fadeIn .4s'}}>🏆 +{gs.potWins[0]}!</div>}
          </div>
        )}
      </div>

      {/* Debug log */}
      <div style={{margin:'4px 10px 0',padding:'6px 10px',background:'rgba(0,0,0,.4)',borderRadius:8,border:'1px solid #0a200a',fontFamily:'monospace'}}>
        <div style={{color:'#1a4a1a',fontSize:9,marginBottom:3}}>◉ nta:[{[...gs.needToAct].join(',')}] acting:{gs.actingIdx} turn:{gs.turnId} {gs.showdown?'SHOWDOWN':''}</div>
        {(gs.debugLog||[]).slice(-3).reverse().map((l,i)=><div key={i} style={{color:i===0?'#2a5a2a':'#162416',fontSize:9,lineHeight:1.6}}>▸ {l}</div>)}
      </div>

      {/* Actions */}
      <div style={{padding:'8px 10px 22px',flexShrink:0}}>
        {gs.showdown?(
          <button onClick={nextHand} style={{background:'#1a0e00',border:'2px solid #f5c842',color:'#f5c842',width:'100%',padding:'15px',fontSize:16,letterSpacing:1,borderRadius:14,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold'}}>Next Hand ▶</button>
        ):isMyTurn?(
          <div>
            {showRaise&&(
              <div style={{marginBottom:10,background:'rgba(0,0,0,.75)',border:'1px solid rgba(255,255,255,.1)',borderRadius:14,padding:'14px',animation:'fadeIn .2s'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <span style={{color:'#888',fontSize:13}}>Raise to:</span>
                  <span style={{color:'#f5c842',fontSize:24,fontWeight:900}}>{raiseAmt}</span>
                </div>
                <div style={{display:'flex',gap:6,marginBottom:10}}>
                  {[{l:'Min',v:minRA},{l:'½ Pot',v:Math.min(gs.pot*.5+gs.currentBet,h.stack+h.bet)},{l:'Pot',v:Math.min(gs.pot+gs.currentBet,h.stack+h.bet)},{l:'All-in',v:h.stack+h.bet}].map(({l,v})=>(
                    <button key={l} onClick={()=>setRaiseAmt(Math.max(minRA,Math.min(Math.floor(v),h.stack+h.bet)))} style={{flex:1,background:'rgba(245,200,66,.08)',color:'#f5c842',border:'1px solid rgba(245,200,66,.25)',borderRadius:8,padding:'6px 0',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>{l}</button>
                  ))}
                </div>
                <input type="range" min={minRA} max={h.stack+h.bet} value={raiseAmt} onChange={e=>setRaiseAmt(+e.target.value)} style={{width:'100%',marginBottom:12}}/>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setShowRaise(false)} style={{background:'#111',border:'2px solid #444',color:'#777',flex:1,padding:'11px 0',borderRadius:11,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:14}}>Cancel</button>
                  <button onClick={()=>heroAct('raise',raiseAmt)} style={{background:'#221500',border:'2px solid #f5c842',color:'#f5c842',flex:2,padding:'11px 0',borderRadius:11,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:14}}>Raise to {raiseAmt} ▶</button>
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
                  :<button onClick={()=>heroAct('call')} style={{background:'#1a0800',border:'2px solid #ff8c00',color:'#ff8c00',flex:1,padding:'15px 0',borderRadius:11,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:14}}>All-in 🔥</button>
                }
              </div>
            )}
          </div>
        ):(
          <div style={{textAlign:'center',color:'#333',fontSize:13,padding:'14px'}}>
            {h?.allIn?"⏳ You're all-in — running it out…":h?.folded?'You folded · watching…':h?.busted?'You\'ve been eliminated':'Waiting for opponents…'}
          </div>
        )}
      </div>
    </div>
  );
}
