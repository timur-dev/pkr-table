import { useState, useEffect, useRef } from "react";

// ── DECK ──────────────────────────────────────────────────────────────────────
const SUITS=['♠','♥','♦','♣'],RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV=Object.fromEntries(RANKS.map((r,i)=>[r,i+2]));
const isRed=s=>s==='♥'||s==='♦';
const mkDeck=()=>{const d=[];SUITS.forEach(s=>RANKS.forEach(r=>d.push({r,s})));return d;};
const shuf=a=>{const d=[...a];for(let i=d.length-1;i>0;i--){const j=0|Math.random()*(i+1);[d[i],d[j]]=[d[j],d[i]];}return d;};

// ── HAND EVAL ────────────────────────────────────────────────────────────────
const cmpA=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
const e5=cs=>{
  const vs=cs.map(c=>RV[c.r]).sort((a,b)=>b-a);
  const fl=new Set(cs.map(c=>c.s)).size===1;
  let st=false,sh=vs[0];
  if(vs[0]-vs[4]===4&&new Set(vs).size===5)st=true;
  if(!st&&vs[0]===14&&vs[1]===5&&vs[2]===4&&vs[3]===3&&vs[4]===2){st=true;sh=5;}
  if(fl&&st)return{rank:sh===14&&vs[1]===13?9:8,name:sh===14&&vs[1]===13?'Royal Flush':'Straight Flush',tb:[sh]};
  const fr={};vs.forEach(v=>fr[v]=(fr[v]||0)+1);
  const cnt=Object.entries(fr).map(([v,c])=>({v:+v,c})).sort((a,b)=>b.c-a.c||b.v-a.v);
  if(cnt[0].c===4)return{rank:7,name:'Four of a Kind',tb:[cnt[0].v,cnt[1].v]};
  if(cnt[0].c===3&&cnt[1].c===2)return{rank:6,name:'Full House',tb:[cnt[0].v,cnt[1].v]};
  if(fl)return{rank:5,name:'Flush',tb:vs};
  if(st)return{rank:4,name:'Straight',tb:[sh]};
  if(cnt[0].c===3)return{rank:3,name:'Three of a Kind',tb:[cnt[0].v,...cnt.slice(1).map(x=>x.v)]};
  if(cnt[0].c===2&&cnt[1].c===2)return{rank:2,name:'Two Pair',tb:[cnt[0].v,cnt[1].v,cnt[2].v]};
  if(cnt[0].c===2)return{rank:1,name:'Pair',tb:[cnt[0].v,...cnt.slice(1).map(x=>x.v)]};
  return{rank:0,name:'High Card',tb:vs};
};
const c5s=arr=>{const r=[];for(let a=0;a<arr.length-4;a++)for(let b=a+1;b<arr.length-3;b++)for(let c=b+1;c<arr.length-2;c++)for(let d=c+1;d<arr.length-1;d++)for(let e=d+1;e<arr.length;e++)r.push([arr[a],arr[b],arr[c],arr[d],arr[e]]);return r;};
const bestH=(hole,comm)=>{const all=[...hole,...comm];if(all.length<5)return null;let best=null;for(const cs of c5s(all)){const h=e5(cs);if(!best||h.rank>best.rank||(h.rank===best.rank&&cmpA(h.tb,best.tb)>0))best=h;}return best;};
const getWinners=(players,comm)=>{
  const act=players.filter(p=>!p.folded);if(act.length===1)return[act[0].id];
  const hs=act.map(p=>({id:p.id,h:bestH(p.cards,comm)}));
  let bst=hs[0];for(const h of hs.slice(1))if(h.h&&(!bst.h||h.h.rank>bst.h.rank||(h.h.rank===bst.h.rank&&cmpA(h.h.tb,bst.h.tb)>0)))bst=h;
  return hs.filter(h=>h.h&&bst.h&&h.h.rank===bst.h.rank&&cmpA(h.h.tb,bst.h.tb)===0).map(h=>h.id);
};

// ── AI LOGIC ─────────────────────────────────────────────────────────────────
const aiDecide=(p,gs)=>{
  if(p.stack===0)return'call';
  const h=bestH(p.cards,gs.community),rank=h?h.rank:-1;
  const toCall=Math.max(0,gs.currentBet-p.bet),r=Math.random();
  if(gs.street==='preflop'){
    const v1=RV[p.cards[0].r],v2=RV[p.cards[1].r];
    const s=v1===v2?3:Math.min(v1,v2)>=10?2:Math.abs(v1-v2)<=2?1:0;
    if(s>=3)return r<.6?'raise':'call';
    if(s>=2)return toCall===0?'check':r<.75?'call':'raise';
    if(s>=1)return toCall===0?'check':r<.55?'call':'fold';
    return toCall===0?'check':r<.25?'call':'fold';
  }
  if(rank>=6)return r<.65?'raise':'call';
  if(rank>=4)return toCall===0?'check':r<.7?'call':r<.85?'raise':'fold';
  if(rank>=2)return toCall===0?'check':r<.55?'call':'fold';
  if(rank>=1)return toCall===0?'check':r<.35?'call':'fold';
  return toCall===0?'check':r<.15?'call':'fold';
};

// ── GAME STATE ───────────────────────────────────────────────────────────────
const PI=[{id:0,name:'You',emoji:'🎯',isHero:true},{id:1,name:'Ace',emoji:'🤖',isHero:false},{id:2,name:'Nova',emoji:'⚡',isHero:false}];
const SB_A=25,BB_A=50;
const COMM_N={preflop:0,flop:3,turn:4,river:5};

const mkRound=(stacks,dIdx,pp)=>{
  const deck=shuf(mkDeck());let di=0;
  const cards=[[],[],[]];
  for(let r=0;r<2;r++)for(let p=0;p<3;p++)cards[p].push(deck[di++]);
  di++;
  const comm5=[deck[di++],deck[di++],deck[di++]];di++;comm5.push(deck[di++]);di++;comm5.push(deck[di++]);
  const sbI=(dIdx+1)%3,bbI=(dIdx+2)%3;
  const players=PI.map((pi,i)=>{
    const isSB=i===sbI,isBB=i===bbI;
    const blind=isSB?Math.min(SB_A,stacks[i]):isBB?Math.min(BB_A,stacks[i]):0;
    return{...pi,stack:Math.max(0,stacks[i]-blind),cards:cards[i],bet:blind,folded:stacks[i]===0,busted:stacks[i]===0,lastAct:isSB?'SB':isBB?'BB':''};
  });
  const pot=players.reduce((s,p)=>s+p.bet,0);
  const nta=new Set(players.filter(p=>!p.busted).map(p=>p.id));
  let fa=dIdx;for(let i=0;i<3;i++){const idx=(dIdx+i)%3;if(!players[idx].busted){fa=idx;break;}}
  return{players,comm5,community:[],pot,currentBet:BB_A,minRaise:BB_A,street:'preflop',actingIdx:fa,dealerIdx:dIdx,sbIdx:sbI,bbIdx:bbI,needToAct:nta,winnerIds:[],showdown:false,handNames:{},prizePool:pp};
};

const doAction=(gs,pid,action,raiseTo)=>{
  const ps=gs.players.map(p=>({...p}));const p=ps[pid];
  let pot=gs.pot,cb=gs.currentBet,mr=gs.minRaise,nta=new Set(gs.needToAct);
  if(action==='fold'){p.folded=true;p.lastAct='Fold ✗';nta.delete(pid);}
  else if(action==='check'||action==='call'){
    const tc=Math.max(0,cb-p.bet);
    if(tc>0){const amt=Math.min(tc,p.stack);p.stack-=amt;p.bet+=amt;pot+=amt;p.lastAct=amt===tc?'Call':'All-in';}
    else p.lastAct='Check';
    nta.delete(pid);
  } else if(action==='raise'){
    const rt=raiseTo||cb+mr;
    const amt=Math.min(Math.max(0,rt-p.bet),p.stack);
    const nb=p.bet+amt;mr=Math.max(mr,nb-cb);cb=nb;
    p.stack-=amt;p.bet=nb;pot+=amt;p.lastAct=`Raise ${nb}`;
    nta=new Set(ps.filter(x=>!x.folded&&!x.busted&&x.id!==pid).map(x=>x.id));
  }
  let ngs={...gs,players:ps,pot,currentBet:cb,minRaise:mr,needToAct:nta};
  const active=ps.filter(p=>!p.folded);
  if(active.length===1)return resolveHand(ngs,[active[0].id],false);
  if(nta.size===0)return advStreet(ngs);
  let nx=(pid+1)%3;
  for(let i=0;i<3;i++){const idx=(pid+1+i)%3;if(!ps[idx].folded&&!ps[idx].busted&&nta.has(idx)){nx=idx;break;}}
  return{...ngs,actingIdx:nx};
};

const advStreet=gs=>{
  const ord=['preflop','flop','turn','river','showdown'];
  const nxt=ord[ord.indexOf(gs.street)+1];
  if(nxt==='showdown')return resolveHand({...gs,community:gs.comm5,showdown:true},getWinners(gs.players,gs.comm5),true);
  const comm=gs.comm5.slice(0,COMM_N[nxt]);
  const ps=gs.players.map(p=>({...p,bet:0,lastAct:p.busted?p.lastAct:''}));
  let fa=(gs.dealerIdx+1)%3;for(let i=0;i<3;i++){const idx=(gs.dealerIdx+1+i)%3;if(!ps[idx].folded&&!ps[idx].busted){fa=idx;break;}}
  const nta=new Set(ps.filter(p=>!p.folded&&!p.busted).map(p=>p.id));
  return{...gs,players:ps,community:comm,street:nxt,currentBet:0,minRaise:BB_A,actingIdx:fa,needToAct:nta};
};

const resolveHand=(gs,wIds,sd)=>{
  const share=Math.floor(gs.pot/wIds.length);
  const ps=gs.players.map(p=>({...p,stack:p.stack+(wIds.includes(p.id)?share:0)}));
  const hn={};
  if(sd)ps.filter(p=>!p.folded).forEach(p=>{const h=bestH(p.cards,gs.comm5);if(h)hn[p.id]=h.name;});
  return{...gs,players:ps,pot:0,winnerIds:wIds,street:'showdown',community:gs.comm5,showdown:true,handNames:hn};
};

// ── CARD COMPONENT ───────────────────────────────────────────────────────────
const Card=({card,faceDown,sm})=>{
  const w=sm?38:47,h=sm?54:67;
  if(faceDown)return(
    <div style={{width:w,height:h,borderRadius:7,background:'linear-gradient(145deg,#1a3c90,#0b1e58)',border:'2px solid #2e60ef',boxShadow:'0 4px 12px rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
      <div style={{width:w-14,height:h-14,border:'1.5px solid rgba(100,140,255,.3)',borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(100,140,255,.4)',fontSize:16}}>★</div>
    </div>
  );
  const red=isRed(card.s),clr=red?'#d41515':'#111';
  return(
    <div style={{width:w,height:h,borderRadius:7,background:'#fefefe',border:'1.5px solid #ccc',boxShadow:'0 4px 12px rgba(0,0,0,.7)',padding:'3px 4px',display:'flex',flexDirection:'column',position:'relative',overflow:'hidden',flexShrink:0}}>
      <div style={{fontSize:sm?11:13,fontWeight:'bold',color:clr,lineHeight:1.15}}>{card.r}</div>
      <div style={{fontSize:sm?12:15,color:clr,lineHeight:1}}>{card.s}</div>
      <div style={{position:'absolute',bottom:2,right:3,fontSize:sm?16:22,color:clr,opacity:.7,transform:'rotate(180deg)'}}>{card.s}</div>
    </div>
  );
};

// ── BUTTON STYLE ─────────────────────────────────────────────────────────────
const btn=(bg,border,clr,extra={})=>({background:bg,border:`2px solid ${border}`,color:clr,borderRadius:11,cursor:'pointer',fontFamily:'inherit',fontWeight:'bold',fontSize:14,...extra});

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const [gs,setGs]=useState(null);
  const [screen,setScreen]=useState('lobby');
  const [raiseAmt,setRaiseAmt]=useState(100);
  const [showRaise,setShowRaise]=useState(false);
  const [gameWinner,setGameWinner]=useState(null);
  const timerRef=useRef(null);
  const PP={mult:3,total:1500};

  const startGame=()=>{setGs(mkRound([500,500,500],0,PP));setScreen('playing');setGameWinner(null);setShowRaise(false);};

  useEffect(()=>{
    if(!gs||gs.showdown)return;
    const actor=gs.players[gs.actingIdx];
    if(!actor||actor.isHero||actor.folded||actor.busted)return;
    timerRef.current=setTimeout(()=>{
      const act=aiDecide(actor,gs);
      const rt=act==='raise'?Math.min(gs.currentBet+gs.minRaise,actor.stack+actor.bet):undefined;
      setGs(prev=>doAction(prev,actor.id,act,rt));
    },700+Math.random()*900);
    return()=>clearTimeout(timerRef.current);
  },[gs?.actingIdx,gs?.street,gs?.showdown]);

  useEffect(()=>{
    if(!gs?.showdown)return;
    const alive=gs.players.filter(p=>p.stack>0);
    if(alive.length===1)setTimeout(()=>{setGameWinner(alive[0]);setScreen('gameover');},2200);
  },[gs?.showdown]);

  const heroAct=(act,rt)=>{
    if(!gs||gs.showdown||gs.actingIdx!==0)return;
    const h=gs.players[0];if(h.folded||h.busted)return;
    setGs(prev=>doAction(prev,0,act,rt));setShowRaise(false);
  };

  const nextHand=()=>{
    if(!gs)return;
    const alive=gs.players.filter(p=>p.stack>0);
    if(alive.length<2){setScreen('gameover');return;}
    const stacks=gs.players.map(p=>p.stack);
    let nd=(gs.dealerIdx+1)%3;
    for(let i=0;i<3;i++){const idx=(nd+i)%3;if(stacks[idx]>0){nd=idx;break;}}
    setGs(mkRound(stacks,nd,gs.prizePool));setShowRaise(false);
  };

  const h=gs?.players[0];
  const isMyTurn=gs&&!gs.showdown&&gs.actingIdx===0&&h&&!h.folded&&!h.busted;
  const toCall=h&&gs?Math.min(Math.max(0,gs.currentBet-h.bet),h.stack):0;
  const canCheck=h&&gs&&gs.currentBet<=h.bet;
  const minRA=gs?Math.min(gs.currentBet+gs.minRaise,h.stack+h.bet):100;
  const canRaise=h&&h.stack>0&&gs&&h.stack>(gs.currentBet-h.bet);

  // ── LOBBY ──
  if(screen==='lobby')return(
    <div style={{minHeight:'100vh',background:'#07101d',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'"Inter",system-ui,sans-serif',padding:'0 24px'}}>
      <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}@keyframes glow{0%,100%{box-shadow:0 0 10px rgba(245,200,66,.25)}50%{box-shadow:0 0 30px rgba(245,200,66,.65)}}`}</style>
      <div style={{textAlign:'center',maxWidth:380,width:'100%'}}>
        <div style={{fontSize:64,animation:'pulse 2s infinite',marginBottom:4}}>🃏</div>
        <div style={{color:'#f5c842',fontSize:38,fontWeight:900,letterSpacing:4,textTransform:'uppercase',lineHeight:1}}>Spin & Go</div>
        <div style={{color:'#555',fontSize:13,letterSpacing:2,marginBottom:36,marginTop:6}}>TEXAS HOLD'EM · 3 PLAYERS</div>
        <div style={{background:'linear-gradient(145deg,#120d00,#271a00)',border:'2px solid #8B6914',borderRadius:20,padding:'24px',marginBottom:28,animation:'glow 2.5s infinite'}}>
          <div style={{color:'#7a6020',fontSize:11,textTransform:'uppercase',letterSpacing:3,marginBottom:10}}>Prize Pool</div>
          <div style={{color:'#fff',fontSize:52,fontWeight:900,lineHeight:1}}>$1,500</div>
          <div style={{color:'#f5c842',fontSize:20,marginTop:4,fontWeight:'bold'}}>3× MULTIPLIER</div>
          <div style={{color:'#555',fontSize:12,marginTop:10}}>$500 buy-in · Winner takes all</div>
        </div>
        <div style={{display:'flex',gap:10,marginBottom:12}}>
          {PI.map(p=><div key={p.id} style={{flex:1,background:'rgba(255,255,255,.04)',borderRadius:12,padding:'10px 0',border:'1px solid rgba(255,255,255,.08)'}}>
            <div style={{fontSize:22}}>{p.emoji}</div>
            <div style={{color:'#aaa',fontSize:11,marginTop:3}}>{p.name}</div>
          </div>)}
        </div>
        <button onClick={startGame} style={{...btn('linear-gradient(135deg,#b8900a,#f5c842)','#f5c842','#000'),width:'100%',padding:'18px',fontSize:18,letterSpacing:2,borderRadius:16,boxShadow:'0 4px 28px rgba(245,200,66,.4)'}}>
          ▶ PLAY NOW
        </button>
      </div>
    </div>
  );

  // ── GAME OVER ──
  if(screen==='gameover')return(
    <div style={{minHeight:'100vh',background:'#07101d',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'"Inter",system-ui,sans-serif',padding:'0 24px',textAlign:'center'}}>
      <div style={{fontSize:80,marginBottom:12}}>{gameWinner?.isHero?'🏆':'💀'}</div>
      <div style={{color:gameWinner?.isHero?'#f5c842':'#777',fontSize:34,fontWeight:900,marginBottom:8}}>{gameWinner?.isHero?'YOU WIN!':'BUSTED'}</div>
      <div style={{color:'#666',fontSize:15,marginBottom:6}}>{gameWinner?.isHero?'You take the $1,500 prize pool!`':`${gameWinner?.name} wins the prize pool.`}</div>
      <div style={{color:'#444',fontSize:13,marginBottom:36}}>{gameWinner?.isHero?'Outstanding play 🎉':'Better luck next time.'}</div>
      <button onClick={startGame} style={{...btn('linear-gradient(135deg,#b8900a,#f5c842)','#f5c842','#000'),padding:'16px 48px',fontSize:16,borderRadius:14}}>Play Again</button>
    </div>
  );

  if(!gs)return null;
  const p1=gs.players[1],p2=gs.players[2];

  // ── TABLE ──
  return(
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#07101d',fontFamily:'"Inter",system-ui,sans-serif',display:'flex',flexDirection:'column',color:'#fff',WebkitFontSmoothing:'antialiased'}}>
      <style>{`@keyframes glow{0%,100%{box-shadow:0 0 8px rgba(245,200,66,.25)}50%{box-shadow:0 0 22px rgba(245,200,66,.65)}}@keyframes winGlow{0%,100%{box-shadow:0 0 8px rgba(76,255,138,.2)}50%{box-shadow:0 0 22px rgba(76,255,138,.6)}}@keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Top bar */}
      <div style={{background:'linear-gradient(90deg,#0c0700,#1e1200,#0c0700)',borderBottom:'1px solid #2a1600',padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <div style={{color:'#f5c842',fontWeight:800,fontSize:13,letterSpacing:1}}>🎰 SPIN & GO</div>
        <div style={{textAlign:'center'}}>
          <div style={{color:'#fff',fontSize:15,fontWeight:'bold'}}>$1,500 <span style={{color:'#f5c842',fontSize:12}}>3×</span></div>
          <div style={{color:'#555',fontSize:10,letterSpacing:1}}>Blinds 25/50</div>
        </div>
        <div style={{color:'#f5c842',fontSize:11,fontWeight:'bold',background:'rgba(245,200,66,.1)',padding:'4px 12px',borderRadius:20,border:'1px solid rgba(245,200,66,.25)',textTransform:'uppercase',letterSpacing:1}}>
          {gs.street}
        </div>
      </div>

      {/* AI Players */}
      <div style={{display:'flex',gap:8,padding:'10px 10px 0'}}>
        {[p1,p2].map((p,i)=>{
          const pid=i+1,isAct=!gs.showdown&&gs.actingIdx===pid&&!p.folded&&!p.busted,isW=gs.winnerIds.includes(pid);
          return(
            <div key={pid} style={{flex:1,background:isW?'rgba(76,255,138,.07)':'rgba(4,10,22,.95)',border:`2px solid ${isAct?'#f5c842':isW?'#4cff8a':'rgba(255,255,255,.09)'}`,borderRadius:14,padding:'10px',opacity:p.busted?.3:p.folded?.42:1,animation:isAct?'glow 1.4s infinite':isW?'winGlow 1.4s infinite':'none',transition:'opacity .3s'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:7}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:20}}>{p.emoji}</span>
                  <div>
                    <div style={{fontSize:12,fontWeight:'bold',color:p.busted?'#555':'#fff'}}>{p.name}</div>
                    <div style={{color:'#f5c842',fontSize:11}}>💰{p.stack}</div>
                  </div>
                </div>
                {gs.dealerIdx===pid&&<div style={{background:'#f5c842',color:'#000',borderRadius:'50%',width:19,height:19,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:900,flexShrink:0}}>D</div>}
              </div>
              <div style={{display:'flex',gap:3,justifyContent:'center',marginBottom:6}}>
                {p.cards.map((c,ci)=><Card key={ci} card={c} faceDown={!gs.showdown&&!p.busted} sm />)}
              </div>
              <div style={{minHeight:16,textAlign:'center'}}>
                {p.bet>0&&<span style={{color:'#7ee8a2',fontSize:11}}>Bet {p.bet}</span>}
                {!p.bet&&p.lastAct&&<span style={{color:'#666',fontSize:10}}>{p.lastAct}</span>}
              </div>
              {gs.handNames[pid]&&<div style={{color:'#f5c842',fontSize:10,textAlign:'center',fontWeight:'bold',animation:'fadeIn .4s'}}>{gs.handNames[pid]}</div>}
              {isW&&<div style={{color:'#4cff8a',fontSize:11,textAlign:'center',fontWeight:'bold',marginTop:3,animation:'fadeIn .4s'}}>🏆 Winner!</div>}
              {p.busted&&<div style={{color:'#444',fontSize:10,textAlign:'center',letterSpacing:1}}>BUSTED</div>}
            </div>
          );
        })}
      </div>

      {/* Felt Table */}
      <div style={{margin:'10px',background:'radial-gradient(ellipse at 50% 40%,#145d2b 0%,#0b3f1d 55%,#061e0c 100%)',borderRadius:28,border:'7px solid #4a2900',outline:'2px solid #7a4d00',padding:'16px 10px 14px',display:'flex',flexDirection:'column',alignItems:'center',gap:10,boxShadow:'inset 0 0 50px rgba(0,0,0,.75)',flexShrink:0}}>
        {/* Community */}
        <div style={{display:'flex',gap:5}}>
          {[0,1,2,3,4].map(i=>(
            gs.community[i]
              ?<div key={i} style={{animation:'fadeIn .35s'}}><Card card={gs.community[i]} faceDown={false} /></div>
              :<div key={i} style={{width:47,height:67,borderRadius:7,border:'1.5px dashed rgba(255,255,255,.1)',background:'rgba(0,0,0,.12)',flexShrink:0}} />
          ))}
        </div>
        {/* Pot */}
        <div style={{background:'rgba(0,0,0,.55)',border:'1px solid rgba(245,200,66,.3)',borderRadius:20,padding:'5px 18px',color:'#f5c842',fontSize:14,fontWeight:'bold',minHeight:28,display:'flex',alignItems:'center',gap:6}}>
          {gs.pot>0?<>💰 POT: <span>{gs.pot}</span></>:gs.winnerIds.length>0?'✓ Pot Awarded':'—'}
        </div>
      </div>

      {/* Hero */}
      <div style={{margin:'0 10px',flex:1}}>
        {h&&<div style={{background:gs.winnerIds.includes(0)?'rgba(76,255,138,.08)':'rgba(4,10,22,.95)',border:`2px solid ${isMyTurn?'#f5c842':gs.winnerIds.includes(0)?'#4cff8a':'rgba(255,255,255,.1)'}`,borderRadius:14,padding:'12px 14px',opacity:h.folded?.4:1,animation:isMyTurn?'glow 1.4s infinite':gs.winnerIds.includes(0)?'winGlow 1.4s infinite':'none',transition:'opacity .3s'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:24}}>{h.emoji}</span>
              <div>
                <div style={{fontSize:14,fontWeight:'bold'}}>{h.name}</div>
                <div style={{color:'#f5c842',fontSize:12}}>💰 {h.stack}</div>
              </div>
            </div>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              {gs.dealerIdx===0&&<div style={{background:'#f5c842',color:'#000',borderRadius:'50%',width:21,height:21,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:900}}>D</div>}
              {isMyTurn&&<div style={{color:'#f5c842',fontSize:11,fontWeight:'bold',letterSpacing:.5}}>YOUR TURN</div>}
            </div>
          </div>
          <div style={{display:'flex',gap:6,justifyContent:'center',marginBottom:8}}>
            {h.cards.map((c,i)=><Card key={i} card={c} faceDown={false} />)}
          </div>
          <div style={{textAlign:'center',minHeight:16}}>
            {h.bet>0&&<span style={{color:'#7ee8a2',fontSize:12}}>Bet: {h.bet}  </span>}
            {h.lastAct&&<span style={{color:'#666',fontSize:11}}>{h.lastAct}</span>}
          </div>
          {gs.handNames[0]&&<div style={{color:'#f5c842',fontSize:12,textAlign:'center',fontWeight:'bold',marginTop:4,animation:'fadeIn .4s'}}>{gs.handNames[0]}</div>}
          {gs.winnerIds.includes(0)&&<div style={{color:'#4cff8a',fontSize:14,textAlign:'center',fontWeight:'bold',marginTop:4,animation:'fadeIn .4s'}}>🏆 You Win This Hand!</div>}
        </div>}
      </div>

      {/* Actions */}
      <div style={{padding:'10px 10px 22px',flexShrink:0}}>
        {gs.showdown?(
          <button onClick={nextHand} style={{...btn('#1a0e00','#f5c842','#f5c842'),width:'100%',padding:'15px',fontSize:16,letterSpacing:1,borderRadius:14,boxShadow:'0 0 20px rgba(245,200,66,.2)'}}>
            Next Hand ▶
          </button>
        ):isMyTurn?(
          <div>
            {showRaise&&(
              <div style={{marginBottom:10,background:'rgba(0,0,0,.65)',border:'1px solid rgba(255,255,255,.1)',borderRadius:14,padding:'14px',animation:'fadeIn .2s'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <span style={{color:'#888',fontSize:13}}>Raise to:</span>
                  <span style={{color:'#f5c842',fontSize:22,fontWeight:900}}>{raiseAmt}</span>
                </div>
                <div style={{display:'flex',gap:6,marginBottom:10}}>
                  {[{l:'Min',v:minRA},{l:'Pot',v:Math.min(gs.pot+Math.max(0,gs.currentBet-h.bet)*2,h.stack+h.bet)},{l:'All-in',v:h.stack+h.bet}].map(({l,v})=>(
                    <button key={l} onClick={()=>setRaiseAmt(Math.max(minRA,Math.min(Math.floor(v),h.stack+h.bet)))} style={{flex:1,background:'rgba(245,200,66,.1)',color:'#f5c842',border:'1px solid rgba(245,200,66,.3)',borderRadius:8,padding:'6px 0',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>{l}</button>
                  ))}
                </div>
                <input type="range" min={minRA} max={h.stack+h.bet} value={raiseAmt} onChange={e=>setRaiseAmt(+e.target.value)} style={{width:'100%',accentColor:'#f5c842',marginBottom:10}} />
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setShowRaise(false)} style={{...btn('#1a0000','#555','#888'),flex:1,padding:'11px 0',fontSize:13}}>Cancel</button>
                  <button onClick={()=>heroAct('raise',raiseAmt)} style={{...btn('#2a1800','#f5c842','#f5c842'),flex:2,padding:'11px 0',fontSize:14}}>
                    Raise to {raiseAmt} ▶
                  </button>
                </div>
              </div>
            )}
            {!showRaise&&(
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>heroAct('fold')} style={{...btn('#1c0404','#c0392b','#ff6b6b'),flex:1,padding:'15px 0',fontSize:14}}>Fold</button>
                <button onClick={()=>heroAct(canCheck?'check':'call')} style={{...btn('#011428','#2980b9','#5bc0ff'),flex:1.5,padding:'15px 0',fontSize:14}}>
                  {canCheck?'Check':`Call ${toCall}`}
                </button>
                {canRaise&&<button onClick={()=>{setRaiseAmt(minRA);setShowRaise(true);}} style={{...btn('#1a1100','#d4ac0d','#f5c842'),flex:1,padding:'15px 0',fontSize:14}}>Raise</button>}
              </div>
            )}
          </div>
        ):(
          <div style={{textAlign:'center',color:'#444',fontSize:13,padding:'14px'}}>
            {h?.folded?'You folded · watching the hand...':h?.busted?'You are eliminated':'Waiting for opponents…'}
          </div>
        )}
      </div>
    </div>
  );
}
