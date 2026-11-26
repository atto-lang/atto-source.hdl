// Closed, signed-i64 quantity admission for a constant RTL module.
// This is compile-time typed folding, NOT a dynamic signed datapath or runtime.
const MIN=-(1n<<63n),MAX=(1n<<63n)-1n,LIMIT=(1n<<256n)-1n;
const scalar=()=>[0,0,0,0,0,0,0,0];
const equal=(a,b)=>a.every((v,i)=>v===b[i]);
const sameScale=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const ONE=[1n,1n];
function gcd(a,b){while(b){const r=a%b;a=b;b=r;}return a;}
export function isClosedQuantityProfile(masked){
 return /^\s*(?:define\s+(?:dimension|unit)\b|(?:declare\s+)?type\b|(?:pub\s+)?fnc\s+main\s*\(\s*\)\s*(?:->|:)\s*int\b)/.test(masked);
}
export function foldClosedQuantity(masked,fail,original=masked){
 const tokens=[];const re=/\s+|trap!(?=[ \t\r\n\v\f])|\|>|>=|<=|[0-9][0-9_]*|[A-Za-z_][A-Za-z_0-9]*|::|->|[()+*\/<>=.,:;{}-]|./gy;
 for(const m of masked.matchAll(re)){
  if(/^\s+$/.test(m[0]))continue;
  if(!/^(?:trap!|\|>|>=|<=|[0-9][0-9_]*|[A-Za-z_][A-Za-z_0-9]*|::|->|[()+*\/<>=.,:;{}-])$/.test(m[0]))fail('HDL_QUANTITY_SYNTAX',{offset:m.index},'unsupported quantity token');
  if(m[0]==='trap!'&&!/[ \t\r\n\v\f]/.test(original[m.index+5]??''))
   fail('E_BANG_KEYWORD_WHITESPACE',{offset:m.index},'ASCII whitespace required after trap!');
  tokens.push({value:m[0],offset:m.index});if(tokens.length>4096)fail('HDL_TOKEN_LIMIT',tokens.at(-1),'quantity tokens');
 }
 tokens.push({value:'<eof>',offset:masked.length});
 let i=0;const peek=()=>tokens[i],take=()=>tokens[i++];
 const err=(code,detail)=>fail(code,peek(),detail);
 const eat=v=>{if(peek().value!==v)return false;i++;return true;};
 const expect=v=>{if(!eat(v))err('HDL_QUANTITY_SYNTAX','expected '+v);};
 const ident=()=>{const t=take();if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.value))fail('E_UNIT_NAME',t,'expected identifier');return t.value;};
 const integer=(negative=false)=>{
  const t=take();if(t.value.length>64||!/^\d(?:\d|_\d)*$/.test(t.value))fail('HDL_QUANTITY_SYNTAX',t,'invalid decimal literal');
  const v=BigInt(t.value.replaceAll('_',''))*(negative?-1n:1n);
  if(v<MIN||v>MAX)fail('E_UNIT_RANGE',t,'integer literal range');return v;
 };
 const norm=(n,d)=>{const g=gcd(n,d);n/=g;d/=g;if(n>LIMIT||d>LIMIT)err('E_UNIT_LIMIT','scale exceeds 256 bits');return [n,d];};
 const mulScale=(a,b)=>norm(a[0]*b[0],a[1]*b[1]);
 const factor=()=>{if(!/^\d/.test(peek().value))err('E_UNIT_SCALE','positive factor required');const n=integer();if(n<=0n)err('E_UNIT_SCALE','positive factor required');return n;};
 const dims=new Map(),units=new Map(),refinements=new Map(),nodes=[];
 const known=n=>dims.has(n)||units.has(n)||refinements.has(n);
 const unit=n=>{if(!units.has(n))err('E_UNIT_NAME','unknown unit');return units.get(n);};
 while(eat('define')){
  const dim=eat('dimension');if(!dim)expect('unit');
  const name=ident();if(known(name))err('E_UNIT_DUPLICATE','duplicate name');
  if(!/^[A-Z]/.test(name))err('E_UNIT_NAME','nominal name must start uppercase');
  if(dim){if(dims.size>=8)err('E_UNIT_LIMIT','dimension count');dims.set(name,dims.size);}
  else{
   if(units.size>=32)err('E_UNIT_LIMIT','unit count');
   expect(':');const dn=ident();if(!dims.has(dn))err('E_UNIT_NAME','unknown dimension');
   const d=dims.get(dn);let scale=ONE;
   if(eat('=')){
    let f=ONE,base;
    if(/^\d/.test(peek().value)){f=[factor(),1n];expect('*');base=unit(ident());}
    else {base=unit(ident());if(eat('*'))f=[factor(),1n];else if(eat('/'))f=[1n,factor()];}
    if(base.d!==d)err('E_UNIT_DIMENSION','incompatible declaration');scale=mulScale(base.scale,f);
   }else if([...units.values()].some(u=>u.d===d))err('E_UNIT_DUPLICATE','duplicate base unit');
   units.set(name,{d,scale});
  }
  expect(';');
 }
 // Admit unused bounded int declarations only; no active alias erasure.
 while(peek().value==='declare'||peek().value==='type'){
  eat('declare');expect('type');const name=ident();
  if(known(name)||!/^[A-Z][A-Za-z0-9_]*$/.test(name)||['Option','Some','None','Result','Ok','Err','Error','String','Symbol','Array','Map','Tuple','Int','Bool','Float'].includes(name))
   err('HDL_REFINEMENT_NAME','invalid or duplicate refinement name');
  if(refinements.size>=32)err('HDL_EXPR_LIMIT','refinement count');
  expect('=');expect('int');expect('where');expect('self');expect('>=');const lo=integer(eat('-'));
  expect('and');expect('self');expect('<=');const hi=integer(eat('-'));expect(';');
  if(lo>hi)err('HDL_REFINEMENT_EMPTY','contradictory refinement');
  refinements.set(name,[lo,hi]);
 }
 eat('pub');expect('fnc');expect('main');expect('(');expect(')');if(!eat('->'))expect(':');expect('int');expect('{');
 function node(op,args,dim=scalar(),scale=ONE){
  if(nodes.length>=1024)err('HDL_EXPR_LIMIT','quantity nodes');
  const depth=1+Math.max(0,...args.filter(x=>typeof x==='object').map(x=>x.depth));
  if(depth>64)err('HDL_DEPTH','quantity expression depth');
  const n={op,args,dim,scale,depth,index:nodes.length};nodes.push(n);return n;
 }
 const plain=n=>equal(n.dim,scalar())&&sameScale(n.scale,ONE);
 function attach(n,name,cast){
  if(cast&&(name==='int'||name==='i64')){if(!plain(n))err('E_UNIT_ERASURE','scalar cast erases quantity');return n;}
  if(!plain(n))err('E_UNIT_ATTACHMENT','repeated unit attachment');
  const u=unit(name);n.dim=scalar();n.dim[u.d]=1;n.scale=u.scale;return n;
 }
 function postfix(n,compact){
  for(;;){
   const cast=eat('::');let dot=false;
   if(!cast)dot=eat('.');
   if(dot&&eat('to_unit')){
    expect('<');const u=unit(ident());expect('>');expect('(');expect(')');
    const dim=scalar();dim[u.d]=1;if(!equal(dim,n.dim))err('E_UNIT_DIMENSION','conversion mismatch');
    if(n.op!=='literal')err('HDL_QUANTITY_PROFILE','literal conversion only');
    const v=n.args[0];const a=n.scale[0]*u.scale[1],b=n.scale[1]*u.scale[0],g=gcd(a,b);
    const den=b/g,num=a/g;if(v%den!==0n)err('E_UNIT_INEXACT','nonintegral conversion');
    const z=v/den*num;if(z<MIN||z>MAX)err('E_UNIT_RANGE','conversion range');
    n.args[0]=z;n.scale=u.scale;compact=false;continue;
   }
   if(!cast&&!dot&&!(compact&&peek().value==='<'))break;
   expect('<');n=attach(n,ident(),cast);expect('>');compact=false;
  }
  return n;
 }
 function atom(depth){
  if(depth>64)err('HDL_DEPTH','quantity parser depth');
  if(eat('<')){const ty=ident();if(ty!=='int'&&ty!=='i64')err('E_UNIT_NAME','unsupported cast target');expect('>');const x=atom(depth+1);if(!plain(x))err('E_UNIT_ERASURE','scalar cast erases quantity');return x;}
  if(eat('+'))return atom(depth+1);
  if(eat('-')){
   if(/^\d/.test(peek().value)&&peek().value.replaceAll('_','')==='9223372036854775808'){
    const t=peek(),v=integer(true);return postfix(node('literal',[v]),t.offset+t.value.length===peek().offset);
   }
   const x=atom(depth+1);return node('neg',[x],x.dim,x.scale);
  }
  if(eat('(')){const x=expr(0,depth+1);expect(')');return postfix(x,false);}
  if(!/^\d/.test(peek().value))err('HDL_QUANTITY_SYNTAX','expected closed expression');
  const t=peek(),v=integer();return postfix(node('literal',[v]),t.offset+t.value.length===peek().offset);
 }
 function expr(min,depth){
  if(depth>64)err('HDL_DEPTH','quantity parser depth');let a=atom(depth+1);
  for(;;){
   const op=peek().value,bp=op==='+'||op==='-'?1:op==='*'||op==='/'?3:0;
   if(!bp||bp<min)break;take();const b=expr(bp+1,depth+1);let dim,scale;
   if(op==='+'||op==='-'){
    if(!equal(a.dim,b.dim))err('E_UNIT_DIMENSION','incompatible additive operands');
    if(!sameScale(a.scale,b.scale))err('E_UNIT_SCALE','incompatible additive scales');dim=a.dim;scale=a.scale;
   }else{
    dim=a.dim.map((v,k)=>v+(op==='*'?b.dim[k]:-b.dim[k]));
    if(dim.some(v=>Math.abs(v)>32))err('E_UNIT_LIMIT','dimension exponent');
    scale=mulScale(a.scale,op==='*'?b.scale:[b.scale[1],b.scale[0]]);
   }
   a=node(op,[a,b],dim,scale);
  }
  if(min===0)while(eat('as'))a=attach(a,ident(),true);
  return a;
 }
 // Pure, closed immutable Option<int> only. No dynamic RTL exception
 // transport or nominal Error allocation. Require exact canonical binders
 // for this experimental proof slice to avoid unverified name resolution.
 let result;
 if(eat('val')){
  for(const n of ['Option','Some','None','Result','Ok','Err','Error'])
   if(known(n))err('HDL_CHECKED_UNWRAP_UNSUPPORTED','shadowed prelude');
  expect('Option');expect('<');expect('int');expect('>');expect('x');expect('=');
  let payload=null;
  if(eat('Some')){expect('(');payload=expr(0,0);expect(')');if(!plain(payload))err('E_UNIT_ERASURE','Option<int> cannot erase quantity');}
  else expect('None');
  expect(';');expect('return');const prefix=eat('match');
  if(prefix){expect('<');expect('int');expect('>');}
  if(!eat('trap!'))expect('trap');
  expect('x');expect('.');expect('unwrap');expect('(');expect(')');
  if(!prefix){expect('|>');expect('match');expect('<');expect('int');expect('>');}
  expect('over');
  expect('on');expect('Ok');expect('(');expect('n');expect(')');expect(':');expect('int');expect('->');expect('n');expect(',');
  expect('on');expect('Err');expect('(');expect(')');expect(':');expect('int');expect('->');
  const fallback=node('literal',[integer(eat('-'))]);expect(',');expect('end');
  result=payload??fallback;
 }else{expect('return');result=expr(0,0);}
 if(!plain(result))err('E_UNIT_ERASURE','scalar return erases quantity');
 expect(';');expect('}');expect('<eof>');
 // Only after static admission, evaluate checked closed arithmetic in
 // source order. No artifact may be emitted for a statically known trap.
 const values=[];
 for(const n of nodes){
  const [a,b]=n.args.map(x=>typeof x==='object'?values[x.index]:x);
  if(n.op==='/'&&b===0n)fail('HDL_STATIC_ARITHMETIC',{offset:0},'divisionByZero');
  const v=n.op==='literal'?a:n.op==='neg'?-a:n.op==='+'?a+b:n.op==='-'?a-b:n.op==='*'?a*b:a/b;
  if(v<MIN||v>MAX)fail('HDL_STATIC_ARITHMETIC',{offset:0},'integerOverflow');
  values.push(v);
 }
 return values[result.index];
}
