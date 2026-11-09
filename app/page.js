'use client';
import { useEffect, useRef, useState } from 'react';
import { requestChat } from '../lib/chat-client.js';
import { formatAnswerBlocks } from '../lib/answer-format.js';
function Icon({ name, size = 20, ...props }) {
 const paths = { plus: 'M12 5v14M5 12h14', arrow: 'M7 17 17 7M7 7h10v10', send: 'M12 19V5m-6 6 6-6 6 6', book: 'M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v14c-4-1-6 0-9 2-3-2-5-3-9-2Z', spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z', grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z', menu: 'M4 6h16M4 12h16M4 18h16', close: 'm6 6 12 12M6 18 18 6', check: 'm5 12 4 4L19 6', copy: 'M8 8h12v13H8ZM4 16H2V2h13v3', clock: 'M12 7v5l3 2', cap: 'm2 9 10-5 10 5-10 5Zm4 3v5c4 3 8 3 12 0v-5M22 9v7', shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z', chevron: 'm9 5 7 7-7 7' };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{name === 'clock' && <circle cx="12" cy="12" r="9"/>}<path d={paths[name] || paths.spark}/></svg>;
}
function AnswerBody({text,language}) {
 return <div className="answer-body" lang={language==='MY'?'my':undefined}>{formatAnswerBlocks(text).map((block,index)=>block.type==='paragraph'?<p key={index}>{block.text}</p>:block.type==='ordered'?<ol key={index}>{block.items.map((item,i)=><li key={i}>{item}</li>)}</ol>:<ul key={index}>{block.items.map((item,i)=><li key={i}>{item}</li>)}</ul>)}</div>;
}
export default function Home() {
 const [draft,setDraft]=useState(''); const [messages,setMessages]=useState([]); const [menu,setMenu]=useState(false); const [toast,setToast]=useState('');
 const [pending,setPending]=useState(false);
 const activeRequest=useRef(null);
 const input=useRef(null), dialog=useRef(null), end=useRef(null), nav=useRef(null), menuButton=useRef(null);
 useEffect(()=>{if(messages.length)end.current?.scrollIntoView({block:'nearest'});},[messages,pending]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),2200);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{if(!menu)return;const prev=document.activeElement;nav.current?.querySelector('a,button')?.focus();function key(e){if(e.key==='Escape'){setMenu(false);return;}if(e.key==='Tab'&&!dialog.current?.open){const items=nav.current.querySelectorAll('a,button');const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);prev?.focus();};},[menu]);
 useEffect(()=>()=>{activeRequest.current?.abort();activeRequest.current=null;},[]);
 function reset(){activeRequest.current?.abort();activeRequest.current=null;setPending(false);setMessages([]);setDraft('');setMenu(false);requestAnimationFrame(()=>input.current?.focus());}
 async function ask(question,retryId=null){
  if(activeRequest.current)return;
  const controller=new AbortController();activeRequest.current=controller;setPending(true);
  const answerId=retryId??crypto.randomUUID();
  if(retryId)setMessages(prev=>prev.filter(message=>message.id!==retryId));
  else setMessages(prev=>[...prev,{id:crypto.randomUUID(),role:'user',text:question}]);
  try{
   const result=await requestChat(question,{signal:controller.signal});
   if(activeRequest.current!==controller)return;
   setMessages(prev=>[...prev,{id:answerId,role:'assistant',text:result.answer,result}]);
  }catch(error){
   if(activeRequest.current!==controller)return;
   setMessages(prev=>[...prev,{id:answerId,role:'assistant',text:controller.signal.aborted?'Request stopped. The server may already have used one AI request.':error.message,error:true,question}]);
  }finally{
   if(activeRequest.current===controller){activeRequest.current=null;setPending(false);}
  }
 }
 function submit(e){e.preventDefault();const question=draft.trim();if(!question||question.length>2000||activeRequest.current)return;setDraft('');void ask(question);}
 async function copy(text){try{await navigator.clipboard.writeText(text);setToast('Copied to clipboard');}catch{setToast('Select the message text to copy it.');}}
 return <div className="app-shell">
 {menu&&<button className="scrim" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}
 <aside ref={nav} className={`sidebar ${menu?'is-open':''}`} aria-label="Main navigation">
 <a href="/" className="brand"><span className="brand-emblem"><Icon name="spark" size={25}/></span><span>compass<span className="brand-detail">BY UIT ACADEMIC QA</span></span></a>
 <button className="new-chat" onClick={reset}><Icon name="plus" size={17}/> New conversation <span>↗</span></button>
 <div className="profile"><span className="profile-avatar"><img src="/uit-logo.png" alt="UIT logo" width="36" height="32"/></span><span>UIT student community<small>University of Information Technology</small></span><span className="profile-dot"/></div>
 </aside>
 <main inert={menu?true:undefined}><header><div className="header-title"><button ref={menuButton} className="mobile-menu icon-btn" aria-label="Open navigation" aria-expanded={menu} onClick={()=>setMenu(true)}><Icon name="menu"/></button><span>Academic assistant</span><span className="header-slash">/</span><span className="header-sub">Your space for clarity</span></div><span className="preview-badge"><span/> Academic guide</span></header>
 <div className="page-content"><section className={`conversation ${messages.length?'has-messages':''}`}>
 {!messages.length?<div className="welcome"><div className="intro-tag"><span/> ACADEMIC LIFE, SIMPLIFIED</div><h1>Big questions.<br/><span>Clearer answers.</span><span className="heading-star" aria-hidden="true">✳</span></h1><div className="language-note"><span>EN</span><span lang="my">မြန်မာ</span><i/> Just ask. In your own words.</div>
 </div>:<div className="message-list" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions" aria-busy={pending}>{messages.map(message=><article className={`message ${message.role} ${message.error?'message-error':''}`} key={message.id}>{message.role==='assistant'&&<span className="assistant-avatar"><Icon name="spark" size={18}/></span>}<div className="message-content"><span className="message-author">{message.role==='user'?'You':message.error?'Compass - Request not completed':'Compass'}</span>{message.result&&message.result.status!=='answered'&&<span className="answer-status">{{partial:'Partial answer',not_found:'Not specified in supplied sources',clarification:'More information needed'}[message.result.status]}</span>}{message.role==='assistant'?<AnswerBody text={message.text} language={message.result?.language}/>:<p>{message.text}</p>}{message.result?.citations.length>0&&<div className="citations"><span className="citation-heading">Sources <span>{message.result.citations.length} reference{message.result.citations.length===1?'':'s'}</span></span>{message.result.citations.map((citation,index)=><details className="citation" key={`${citation.citationId}-${index}`}><summary><Icon name="book" size={13}/>{citation.kind==='general'?citation.title:<>Section {citation.section} - PDF page {citation.pdfPage}{citation.printedPage?` (printed ${citation.printedPage})`:''}</>}</summary><blockquote lang={citation.kind==='general'?'en':'my'}>{citation.quote}</blockquote><small>{citation.sourceId}{citation.kind==='general'?` - collected ${citation.collectedDate}`:''}</small>{citation.kind==='general'&&<p className="source-verification">{citation.verification}</p>}{citation.section==='FAQ-ADMISSIONS'&&<p className="source-verification">The supplied FAQ is undated. Confirm the marks, timing and required documents for the current intake with UIT.</p>}{citation.url==='https://www.uit.edu.mm/'&&<a className="source-link" href={citation.url} target="_blank" rel="noreferrer">Official UIT website</a>}</details>)}</div>}<div className="message-actions"><button className="copy" onClick={()=>copy(message.text)} aria-label="Copy message"><Icon name="copy" size={13}/> Copy</button>{message.error&&<button className="retry" disabled={pending} onClick={()=>void ask(message.question,message.id)}>Try again</button>}</div></div></article>)}{pending&&<div className="loading-message" role="status"><span className="assistant-avatar"><Icon name="spark" size={18}/></span><span>Reading university sources<span className="loading-dots" aria-hidden="true">...</span></span><button className="stop-request" onClick={()=>activeRequest.current?.abort()}>Stop</button></div>}<div ref={end}/></div>}

 <div className="composer-wrap"><form className="composer" onSubmit={submit}><label htmlFor="question" className="sr-only">Your academic question</label><textarea id="question" ref={input} value={draft} onChange={e=>setDraft(e.target.value)} rows={2} maxLength={2000} placeholder="Ask anything about your academic journey…" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit(e);}}}/><div className="composer-tools"><span><Icon name="book" size={14}/> UIT university sources <span className="composer-separator">·</span><small>{draft.length.toLocaleString()} / 2,000</small></span><button type="submit" className="send" disabled={pending||!draft.trim()} aria-label="Send question"><Icon name="send" size={20}/></button></div></form><div className="composer-caption"><span><Icon name="shield" size={11}/> AI can make mistakes. Check the cited sources.</span><span>↵ Send <i>Shift + ↵ New line</i></span></div></div>
 </section>

 </div><footer><span>Made for the UIT student journey.</span><span>Student project · Confirm official decisions with the university.</span></footer>
 </main>
 <dialog ref={dialog} className="source-dialog" onClick={e=>{if(e.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.current.close();}}}><button className="dialog-close icon-btn" aria-label="Close document details" onClick={()=>dialog.current.close()}><Icon name="close"/></button><span className="dialog-emblem"><Icon name="book" size={28}/></span><div className="eyebrow">YOUR ACADEMIC REFERENCE</div><h2>Academic regulations</h2><p>University of Information Technology<br/>Four-year undergraduate program</p><dl><div><dt>Published</dt><dd>June 2025</dd></div><div><dt>Length</dt><dd>24 PDF pages</dd></div><div><dt>Source</dt><dd>UIT-SRC-025</dd></div></dl><p className="dialog-note">Answers use the supplied June 2025 regulations. Confirm current applicability and individual academic decisions with the university.</p></dialog>
 {toast&&<div className="toast" role="status"><Icon name="check" size={16}/>{toast}</div>}
 </div>;
}
