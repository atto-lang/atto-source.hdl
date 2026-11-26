import {isProxy} from 'node:util/types';
import {isClosedQuantityProfile,foldClosedQuantity} from './closed_quantity.mjs';
/** Experimental standalone Oreslang fixed-width source -> combinational SystemVerilog.
 * Not integrated with full Oreslang frontends or shared HIR/MIR. Unsupported syntax fails closed.
 */
// RTL is not a hosted actor/tenant runtime.
export const TENANT_VM_RUNTIME_SUPPORT = 'UNSUPPORTED';
const MAX_SOURCE=128*1024, MAX_TOKENS=4096, MAX_DEPTH=64, MAX_PARAMS=16, MAX_EXPR_NODES=1024;
const RTL_RESERVED=new Set(['module','endmodule','input','output','wire','reg','logic','assign','always','generate','endgenerate','begin','end','result','if','else','for','while','case','function','task','parameter','localparam','integer','signed','unsigned','default','initial','final','interface','package','import','export','time','tri','wand','wor','supply0','supply1']);
const rtlIdent=(name)=>!RTL_RESERVED.has(name.toLowerCase()) && name !== 'out_result';
// A public, caller-mutable AST must never be treated as a validated RTL
// program. The proof of parsing is bound to the frozen exact AST identity.
const admittedPrograms=new WeakSet();
function sealExpression(expr) {
  if(expr.kind==='binary'){sealExpression(expr.left);sealExpression(expr.right);}
  return Object.freeze(expr);
}
// Bound constructed expression trees, not merely parenthesis depth or node count.
function enforceStructuralExpressionDepth(expr) {
  const pending=[[expr,1]];
  while(pending.length) {
    const [node,depth]=pending.pop();
    if(depth>MAX_DEPTH)
      fail('HDL_DEPTH',{offset:0},'constructed expression AST depth limit');
    if(node.kind==='binary')
      pending.push([node.left,depth+1],[node.right,depth+1]);
  }
}
function admitProgram(program) {
  for(const p of program.params)Object.freeze(p);
  Object.freeze(program.params);
  sealExpression(program.expression);
  Object.freeze(program);
  admittedPrograms.add(program);
  return program;
}
function requireAdmittedProgram(program) {
  if(!admittedPrograms.has(program))
    fail('HDL_UNVERIFIED_AST',{offset:0},
      'RTL emission/evaluation requires immutable parser-admitted program');
}
export class HardwareSourceError extends Error {
  constructor(code,location,detail) { super(code+' at offset '+location+': '+detail); this.name='HardwareSourceError'; this.code=code; this.offset=location; }
}
const fail=(code,t,msg)=>{throw new HardwareSourceError(code,t?.offset??0,msg);};

/**
 * Exact member-name admission, not a replacement for typed resolution.
 * This scalar RTL backend cannot lower Topic<T>, actor capabilities,
 * ownership transfer or typed Result receipts. Source must fail BEFORE
 * any RTL artifact is emitted, even if a prior string or unrelated syntax
 * would otherwise cause a less specific generic parser error.
 *
 * Ignore comments/literals so inert examples cannot impersonate a call.
 * The scan is source-length bounded by lex(), accepts nested block trivia,
 * and recognizes the canonical U+0085 line-comment terminator.
 */
function prepareHardwareSource(source) {
  const masked=source.split('');
  const blank=(start,end)=>masked.fill(' ',start,end);
  let previous='';
  const isStart=c=>c!==undefined&&/[A-Za-z_]/.test(c);
  const isPart=c=>c!==undefined&&/[A-Za-z0-9_]/.test(c);
  const lineEnd=c=>c===undefined||c==='\n'||c==='\r'||c==='\u0085'||c==='\u2028'||c==='\u2029';
  for(let i=0;i<source.length;) {
    const c=source[i];
    if(/\s/.test(c)||c==='\u0085'){i++;continue;}
    if(c==='/'&&source[i+1]==='/'){
      const start=i;
      i+=2;while(i<source.length&&!lineEnd(source[i]))i++;
      blank(start,i);
      continue;
    }
    if(c==='/'&&source[i+1]==='*'){
      const start=i;i+=2;let depth=1;
      while(i<source.length&&depth){
        if(source[i]==='/'&&source[i+1]==='*'){
          if(++depth>128)fail('HDL_TOKEN',{offset:start},'block comment nesting budget exceeded');
          i+=2;
        }else if(source[i]==='*'&&source[i+1]==='/'){depth--;i+=2;}
        else i++;
      }
      if(depth)fail('HDL_TOKEN',{offset:start},'unterminated block comment');
      blank(start,i);
      continue;
    }
    if(c==='"'||c==="'"||c==='`'){
      const quote=c,start=i++;let closed=false;
      while(i<source.length){
        const next=source[i++];
        if(next==='\\'){if(i<source.length)i++;continue;}
        if(next===quote){closed=true;break;}
      }
      if(!closed)fail('HDL_TOKEN',{offset:start},'unterminated source literal');
      previous='literal';continue;
    }
    if(isStart(c)){
      const start=i++;
      while(i<source.length&&isPart(source[i]))i++;
      if(previous==='.'&&source.slice(start,i)==='try_publish')
        fail('HDL_ACTOR_PUBSUB_UNSUPPORTED',{offset:start},
          'Topic.try_publish needs checked actor authority, share! and typed Result receipt lowering; not supported by RTL');
      previous='id';continue;
    }
    previous=c==='.'?'.':'other';i++;
  }
  return masked.join('');
}

function validatedHardwareSource(source) {
  if(typeof source!=='string'||Buffer.byteLength(source,'utf8')>MAX_SOURCE||source.includes('\0')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(source)) fail('HDL_SOURCE_LIMIT',{offset:0},'source must be UTF-8 text at most 128 KiB');
  // Reject Trojan Source reordering controls even in comments/ignored text.
  // U+200E/200F and U+061C are directional marks; U+202A..202E and
  // U+2066..2069 control embedding, overrides and isolates.
  const bidiOffset = source.search(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u);
  if(bidiOffset>=0)
    fail('HDL_BIDI_CONTROL',{offset:bidiOffset},'bidirectional Unicode formatting control in source');
  // Unicode NEL/LS/PS can disguise line/comment boundaries in source views.
  // Reject before lexer whitespace and comment recognition.
  const lineControlOffset = source.search(/[\u0085\u2028\u2029]/u);
  if(lineControlOffset>=0)
    fail('HDL_SOURCE_LINE_CONTROL',{offset:lineControlOffset},'Unicode line separator in source');
  // Source text admitted by the scalar JS frontend must not be allowed to
  // disguise terminal ESC/DEL inside lexically ignored HDL comments.
  const controlOffset = source.search(/[\x1b\x7f]/);
  if(controlOffset>=0)
    fail('HDL_SOURCE_CONTROL',{offset:controlOffset},'terminal control in source');
  return prepareHardwareSource(source);
}
export function lex(source){return lexMasked(source,validatedHardwareSource(source));}
function lexMasked(source,masked){
  const tokens=[];
  const re=/\s+|[A-Za-z_][A-Za-z0-9_]*|<-|->|•|\^\^|[()+\-,;.:{}\[\]~&|^?]|./gy;
  for(const m of masked.matchAll(re)) {
    const value=m[0];
    if(/^\s+$/.test(value)) continue;
    // Keyword bangs need ASCII whitespace after the complete suffix.
    const at=m.index+value.length;
    if(['trap','throw','raise','panic','copy','take','move','borrow','share','pin','drop','pipe','rpipe','stop','expand'].includes(value) &&
       source[at]==='!' && source[at+1]!=='=' &&
       !/^!eq(?![A-Za-z0-9_])/.test(source.slice(at))) {
      const after=at+(value==='copy' && source[at+1]==='!' ? 2 : 1);
      if(!/[ \t\r\n\v\f]/.test(source[after]??''))
        fail('E_BANG_KEYWORD_WHITESPACE',{offset:m.index},'whitespace required after bang keyword');
    }

    if(['copy','take','move','borrow','share'].includes(value) &&
       source[m.index+value.length]==='!' &&
       source[m.index+value.length+1]!=='=' &&
       !/^!eq(?![A-Za-z0-9_])/.test(source.slice(m.index+value.length)))
      fail('HDL_OWNERSHIP_UNSUPPORTED',{offset:m.index},
        'OWNERSHIP_BANG_BACKEND_UNSUPPORTED: typed ownership has no SystemVerilog lowering');
    // The RTL subset has no import linker, allocator or hosted/actor runtime.
    // Reject an actual import token *before* the quote/path lexer error, so
    // canonical atto.core/alloc/std requests cannot be mistaken for supported
    // freestanding libraries or emit a partial hardware artifact.
    if(value==='import') fail('HDL_LIBRARY_PROFILE_UNSUPPORTED',{offset:m.index},
      'Atto core/alloc/std and actor module imports require an unimplemented compiler-owned RTL resolver');
    // Refuse unsupported task and actor forms before typed generic punctuation
    // can obscure the diagnostic. Keep the existing actor-memory and pubsub
    // categories, and do not reserve longer names or comment text.
    // Counted/typed selection is a scheduler operation, not a hardware
    // combinational mux. The comment-masked lexical suffix preserves trivia.
    if(value==='select'||value==='await') {
      const declarationName=['fnc','routine','<-','•'].includes(tokens.at(-1)?.value);
      const selectionHeader=/\s*(?:[({<]|(?:over|first|fair|random)(?![A-Za-z0-9_]))/y;
      const awaitedSelection=/\s*(?:nb\s+)?select(?![A-Za-z0-9_])\s*(?:[({<]|(?:over|first|fair|random)(?![A-Za-z0-9_]))/y;
      selectionHeader.lastIndex=m.index+value.length;
      awaitedSelection.lastIndex=m.index+value.length;
      if((value==='select' && !declarationName && selectionHeader.test(masked)) ||
         (value==='await' && awaitedSelection.test(masked)))
        fail('HDL_SELECT_UNSUPPORTED',{offset:m.index},
          'typed/channel/Future select requires bounded scheduling and ownership; no combinational RTL lowering');
    }
    if(value==='sync'||value==='await')
      fail('HDL_TASK_UNSUPPORTED',{offset:m.index},
        'sync/await task requires caller identity and TaskScope; no RTL lowering');
    const declaration=tokens.at(-1)?.value==='define' ||
      (tokens.at(-1)?.value==='pub' && tokens.at(-2)?.value==='define');
    if(value==='container' && tokens.at(-1)?.value==='state' &&
       (tokens.at(-2)?.value==='define' ||
        (tokens.at(-2)?.value==='pub' && tokens.at(-3)?.value==='define')))
      fail('HDL_STATE_CONTAINER_UNSUPPORTED',{offset:m.index},
        'protected state containers require checked sequential storage, lease authority and lifecycle lowering; no RTL fallback');
    // Persistent state requires a trusted durable broker; never lower a
    // durable declaration as ordinary combinational state. Contextual words
    // remain available as scalar identifiers outside the declaration prefix.
    if(declaration && (value==='durable'||value==='persistent')) {
      const actorHeader=/\s+actor(?![A-Za-z0-9_])/y;
      actorHeader.lastIndex=m.index+value.length;
      if(actorHeader.test(masked))
        fail('HDL_DURABLE_ACTOR_UNSUPPORTED',{offset:m.index},
          'durable actors require transactional storage and incarnation-fenced publication; no RTL fallback');
    }
    if(declaration && value==='actor')
      fail('HDL_ACTOR_MEMORY_UNSUPPORTED',{offset:m.index},
        'nominal actor declarations require Ref32 and lifecycle lowering; no RTL fallback');
    const nextPunctuation=/\s*([(<])/y;
    nextPunctuation.lastIndex=m.index+value.length;
    const next=nextPunctuation.exec(masked)?.[1];
    if((declaration && value==='supervisor') || value==='spawn' ||
       (['receive','ActorGroup','Topic','Subscription'].includes(value) && next==='(') ||
       (['ActorMail','ActorGroup','Topic','Subscription'].includes(value) && next==='<'))
      fail('HDL_ACTOR_UNSUPPORTED',{offset:m.index},
        'actor, supervisor and typed group/topic lifecycle require a target runtime; no RTL lowering');
    if(value==='%') fail('HDL_REMOVED_OPERATOR',{offset:m.index},'use an explicit typed remainder/modulus operation; no RTL lowering');
    if(!/^(?:[A-Za-z_][A-Za-z0-9_]*|<-|->|•|\^\^|[()+\-,;.:{}\[\]~&|^?])$/.test(value)) fail('HDL_TOKEN',{offset:m.index},'unsupported token '+JSON.stringify(value));
    // Canonical exceptional control has no synthesizable typed effect path.
    if(['trap','throw','raise','panic'].includes(value) &&
       source[m.index+value.length]==='!' &&
       source[m.index+value.length+1]!=='=' &&
       !/^!eq(?![A-Za-z0-9_])/.test(source.slice(m.index+value.length)))
      fail('HDL_EXCEPTION_BANG_UNSUPPORTED',{offset:m.index},
        'typed exceptional control cannot be synthesized to RTL');
    if(value==='match') fail('HDL_MATCH_DEFAULT_UNSUPPORTED',{offset:m.index},
      'typed match requires checked combinational selector, exhaustiveness and effect-free arm lowering');
    if(value==='~') fail('HDL_TILDE_AGGREGATE_UNSUPPORTED',{offset:m.index},
      'typed Map/Record requires owned aggregate storage and not combinational RTL');
    tokens.push({value,offset:m.index});
    if(tokens.length>MAX_TOKENS) fail('HDL_TOKEN_LIMIT',{offset:m.index},'too many tokens');
  }
  tokens.push({value:'<eof>',offset:source.length});
  return tokens;
}
// cpu/gpu/quantum are reserved execution-domain words across all Oreslang
// backends (Java and LLVM reject them as identifiers). This RTL subset lowers
// no execution region or CPU/GPU Task, so each fails with a dedicated
// diagnostic instead of an incidental unbound-name or syntax error.
const EXECUTION_DOMAIN_WORDS=new Set(['cpu','gpu','quantum']);
function rejectExecutionDomains(ts) {
  for(let k=0;k<ts.length;k++) {
    const t=ts[k],opensBlock=ts[k+1]?.value==='{';
    if(EXECUTION_DOMAIN_WORDS.has(t.value))
      fail('HDL_EXECUTION_DOMAIN',t,'execution domain '+t.value+' is reserved and not lowered to RTL; no implicit host fallback');
    if((t.value==='task'||t.value==='nb')&&opensBlock)
      fail('HDL_EXECUTION_DOMAIN',t,'execution task requires scheduler-aware Future lowering; not lowered to RTL');
  }
}
// Source-level singleton identity and guarded mutable shared regions cannot
// be synthesized as per-module combinational RTL without changing semantics.
// Reject declaration-context uses before even attempting hardware lowering.
function rejectSingletonDeclarations(tokens) {
  for(let i=0;i<tokens.length;i++) {
    let at=i;
    if(tokens[at]?.value==='pub'&&tokens[at+1]?.value==='define')at++;
    if(tokens[at]?.value!=='define')continue;
    at++;
    if(tokens[at]?.value==='pub')at++;
    if(tokens[at]?.value==='singleton')
      fail('HDL_SINGLETON_UNSUPPORTED',tokens[at],
        'ORES-SINGLETON-UNSUPPORTED: application-domain identity, exactly-once publication and fair unique-owner RW memory cannot be emitted as combinational RTL');
  }
}

// A combinational RTL scalar program has no guest object heap, nominal
// class layout, Ref32 authority, actor incarnation or ownership/borrowing.
// Reject active guest constructs before emitting any SystemVerilog. Scanning
// lexed tokens keeps comments inert and does not grant allocation authority.
function rejectHybridActorMemory(ts) {
  for(let i=0;i<ts.length;i++) {
    const t=ts[i];
    if(t.value==='new' && ts[i+1]?.value!=='<eof>') {
      fail('HDL_ACTOR_MEMORY_UNSUPPORTED',t,
        'object construction requires typed actor-local heap and ownership lowering');
    }
    if(t.value!=='pub' && t.value!=='define')continue;
    let p=i;
    if(ts[p]?.value==='pub')p++;
    if(ts[p]?.value!=='define')continue;
    p++;
    if(ts[p]?.value==='pub')p++;
    if(ts[p]?.value==='class' || ts[p]?.value==='actor') {
      fail('HDL_ACTOR_MEMORY_UNSUPPORTED',ts[p],
        'nominal actor and class declarations require Ref32 and lifecycle lowering; no RTL fallback');
    }
  }
}

export function parseHardwareSource(source) {
  const masked=validatedHardwareSource(source);
  if(isClosedQuantityProfile(masked)){
    const value=foldClosedQuantity(masked,fail);
    return admitProgram({name:'main',params:[],returnWidth:64,signed:true,expression:{kind:'constant',width:64,decimal:value.toString()}});
  }
  const ts=lexMasked(source,masked); let i=0;
  rejectSingletonDeclarations(ts);
  rejectExecutionDomains(ts);
  rejectHybridActorMemory(ts);
  const peek=()=>ts[i],take=()=>ts[i++];
  const expect=want=>{const t=take();if(t.value!==want)fail('HDL_SYNTAX',t,'expected '+want+', got '+t.value);return t;};
  const ident=()=>{const t=take();if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.value))fail('HDL_IDENT',t,'expected identifier');if(!rtlIdent(t.value))fail('HDL_RESERVED',t,'identifier reserved by RTL backend');return t.value;};
  const width=()=>{const t=take(),m=/^u([1-9][0-9]*)$/.exec(t.value);if(!m||Number(m[1])>64)fail('HDL_WIDTH',t,'only unsigned u1..u64 are supported');return Number(m[1]);};
  // File-level Atto namespace metadata never becomes a Verilog package,
  // unchecked import, or synthetic hardware module.
  let hasNamespace=false;
  if(peek().value==='use'){
    take();expect('namespace');ident();expect(';');
    hasNamespace=true;
  }
  if(peek().value==='use'||peek().value==='namespace')
    fail(hasNamespace?'HDL_NAMESPACE_DUPLICATE':'HDL_NAMESPACE_HEADER_ORDER',
      peek(),'namespace header must occur once before all declarations');
  // Public file exports can surround the single scalar declaration. No package linker.
  const fileExports=new Set();
  function fileExport() {
    const at=expect('export');expect('pub');
    if(peek().value==='[') {
      take();expect('pkg');expect(']');
      fail('HDL_PACKAGE_EXPORT_UNSUPPORTED',at,'RTL module has no package-private linker authority');
    }
    if(peek().value==='class')
      fail('HDL_EXPORT_KIND_UNSUPPORTED',peek(),'HDL cannot lower nominal class types');
    if(peek().value==='fnc')take();
    const target=ident();expect(';');
    if(fileExports.has(target))fail('HDL_EXPORT_DUPLICATE',at,'duplicate export');
    fileExports.add(target);
  }
  while(peek().value==='export')fileExport();
  if(peek().value==='pub')take();
  // Return-first type headers must not introduce a new executable language.
  // The limited u1..u64 forms reuse the exact same admission and RTL AST.
  const hasFnc=peek().value==='fnc';
  if(hasFnc)take();
  const hasReturnMarker=ts[i+1]?.value==='<-' || ts[i+1]?.value==='•';
  let inferredReturn=hasReturnMarker && peek().value==='infer';
  const returnFirst=hasReturnMarker &&
    (inferredReturn || /^u(?:[1-9][0-9]*)$/.test(peek().value));
  if(!hasFnc && !returnFirst)
    fail('HDL_SYNTAX',peek(),'expected fnc or return-first typed header');
  let name,returnWidth=null;
  if(returnFirst){
    if(inferredReturn)take(); // contextual infer is proven by the returned AST
    else returnWidth=width();
    take();name=ident(); // consume one contiguous <- or bullet separator
  }
  else name=ident();
  expect('(');
  const params=[];
  if(peek().value!==')'){
    do{
      if(params.length>=MAX_PARAMS)fail('HDL_PARAMS_LIMIT',peek(),'at most 16 inputs');
      const bits=width(),id=ident();
      if(params.some(p=>p.name===id))fail('HDL_DUPLICATE',peek(),'duplicate parameter '+id);
      params.push({name:id,width:bits});
      if(peek().value!==',')break;
      take();
    }while(true);
  }
  expect(')');
  if(!returnFirst){
    // Name-first `fnc add(...) -> u8` and `fnc add(...): u8 ->`
    // share the same immutable AST and bounded width inference.
    const leadingArrow=peek().value==='->';
    if(leadingArrow)take();else expect(':');
    if(peek().value==='infer'){take();inferredReturn=true;}
    else returnWidth=width();
    if(!leadingArrow && peek().value==='->')take();
  }
  const braced=peek().value==='{';
  if(braced)take();
  else if(returnFirst&&peek().value==='begin')take();
  else if(!returnFirst)expect('{');
  if(peek().value==='^')take();else expect('return');
  const symbols=new Map(params.map(p=>[p.name,p.width]));
  function primary(depth){
    if(depth>MAX_DEPTH)fail('HDL_DEPTH',peek(),'expression nesting limit');
    if(peek().value==='('){take();const e=expression(depth+1);expect(')');return e;}
    if(peek().value==='^')
      fail('HDL_REMOVED_OPERATOR',peek(),'single caret is statement return, not an expression operator; use ^^ for bitwise XOR');
    if(peek().value==='Integer' && ts[i+1]?.value==='.') {
      const where=take();take();const member=take();
      if(member.value!=='bitXor')
        fail('HDL_INTRINSIC',member,'only Integer.bitXor is supported by this HDL subset');
      if(symbols.has('Integer'))
        fail('HDL_INTRINSIC_SHADOW',where,'Integer intrinsic conflicts with an input named Integer');
      expect('(');const a=expression(depth+1);expect(',');const b=expression(depth+1);expect(')');
      if(a.width!==b.width)fail('HDL_MISMATCH',member,'Integer.bitXor requires equal unsigned bit widths');
      if(++expressionNodes>MAX_EXPR_NODES)fail('HDL_EXPR_LIMIT',member,'expression too complex');
      return {kind:'binary',op:'^',left:a,right:b,width:a.width};
    }
    const t=take(),bits=symbols.get(t.value);
    if(bits===undefined)fail('HDL_UNBOUND',t,'undeclared or unsupported expression '+t.value);
    return {kind:'input',name:t.value,width:bits};
  }
  let expressionNodes=0;
  function binaryLayer(next,operators,depth){
    let a=next(depth);
    while(operators.includes(peek().value)){
      const op=take(),b=next(depth);
      if(a.width!==b.width)fail('HDL_MISMATCH',op,'mixed widths require explicit cast (not implemented)');
      if(++expressionNodes>MAX_EXPR_NODES)fail('HDL_EXPR_LIMIT',op,'expression too complex');
      a={kind:'binary',op:op.value==='^^'?'^':op.value,left:a,right:b,width:a.width};
    }
    return a;
  }
  const additive=(depth)=>binaryLayer(primary,['+','-'],depth);
  const bitAnd=(depth)=>binaryLayer(additive,['&'],depth);
  const bitXor=(depth)=>binaryLayer(bitAnd,['^^'],depth);
  const expression=(depth=0)=>{
    const a=binaryLayer(bitXor,['|'],depth);
    if(peek().value==='^')fail('HDL_REMOVED_OPERATOR',peek(),
      'single caret is statement return, not an expression operator; use ^^ for bitwise XOR');
    return a;
  };
  const expr=expression();expect(';');expect(braced?'}':'end');
  if(!braced && (peek().value===';' || peek().value==='.'))take();
  while(peek().value==='export')fileExport();
  if(peek().value==='use'||peek().value==='namespace')
    fail(hasNamespace?'HDL_NAMESPACE_DUPLICATE':'HDL_NAMESPACE_HEADER_ORDER',
      peek(),'late or duplicate namespace header');
  expect('<eof>');
  if([...fileExports].some(exported=>exported!==name))
    fail('HDL_EXPORT_UNBOUND',{offset:0},'export target must be the compiled fnc');
  if(inferredReturn) returnWidth=expr.width;
  if(!params.length)fail('HDL_PARAMS',{offset:0},'at least one input required');
  if(expr.width!==returnWidth)fail('HDL_RETURN_WIDTH',{offset:0},'return width does not equal expression width');
  enforceStructuralExpressionDepth(expr);
  return admitProgram({name,params,returnWidth,expression:expr});
}
function renderExpr(e){
  if(e.kind==='input')return 'in_'+e.name;
  if(e.kind==='constant')return "64'sh"+BigInt.asUintN(64,BigInt(e.decimal)).toString(16).padStart(16,'0');
  return '('+renderExpr(e.left)+' '+e.op+' '+renderExpr(e.right)+')';
}
export function emitSystemVerilog(p){
  requireAdmittedProgram(p);
  const ports=p.params.map(x=>'    input logic ['+(x.width-1)+':0] in_'+x.name);
  ports.push('    output logic '+(p.signed?'signed ':'')+'['+(p.returnWidth-1)+':0] out_result');
  return '// Generated from EXPERIMENTAL Oreslang hardware subset\n// '+(p.signed?'Closed checked quantity constant; no runtime traps':'Unsigned arithmetic wraps at output width')+'\nmodule ores_'+p.name+'(\n'+ports.join(',\n')+'\n);\n    assign out_result = '+renderExpr(p.expression)+';\nendmodule\n';
}
// Explicit strict hardware admission. No fallback to unsigned or ordinary RTL.
export function compileStrictSource(source){
  const masked=validatedHardwareSource(source);
  let value;
  try{value=foldClosedQuantity(masked,fail,{strict:true});}
  catch(e){
    if(e?.code==='HDL_QUANTITY_SYNTAX'||e?.code==='HDL_QUANTITY_PROFILE')
      fail('E_VERIFY_UNSUPPORTED',{offset:0},'strict HDL admits only a closed signed scalar return');
    throw e;
  }
  const program=admitProgram({name:'main',params:[],returnWidth:64,signed:true,expression:{kind:'constant',width:64,decimal:value.toString()}});
  return {program,systemVerilog:emitSystemVerilog(program)};
}
export function compileSource(source){const program=parseHardwareSource(source);return {program,systemVerilog:emitSystemVerilog(program)};}
export function evaluateReference(program,inputs){
  requireAdmittedProgram(program);
  // Treat caller values as data only: getters and Proxy traps may otherwise
  // mutate a reference vector between validation and evaluation.
  if(isProxy(inputs) || inputs===null || typeof inputs!=='object' ||
      Array.isArray(inputs) ||
      (Object.getPrototypeOf(inputs)!==Object.prototype &&
       Object.getPrototypeOf(inputs)!==null))
    throw new TypeError('missing input or unsupported input record');
  const descriptors=Object.getOwnPropertyDescriptors(inputs);
  if(Reflect.ownKeys(descriptors).length!==program.params.length ||
      !program.params.every(p=>Object.hasOwn(descriptors,p.name) &&
        Object.hasOwn(descriptors[p.name],'value')))
    throw new TypeError('missing input or accessor-backed input');
  const values=Object.fromEntries(program.params.map(p=>[p.name,descriptors[p.name].value]));
  function go(e){
    const mask=(1n<<BigInt(e.width))-1n;
    if(e.kind==='constant')return BigInt(e.decimal);
    if(e.kind==='input'){
      const n=values[e.name];
      if(typeof n!=='bigint')throw new TypeError('non-BigInt input '+e.name);
      if(n<0n||n>mask)throw new RangeError('out of range input '+e.name);
      return n;
    }
    const a=go(e.left),b=go(e.right);
    const value=e.op==='+'?a+b:e.op==='-'?a-b:e.op==='&'?a&b:e.op==='^'?a^b:e.op==='|'?a|b:null;
    if(value===null)throw new TypeError('unsupported operator '+e.op);
    return value&mask;
  }
  return go(program.expression);
}
