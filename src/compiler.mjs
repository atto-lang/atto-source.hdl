import {isProxy} from 'node:util/types';
/** Experimental standalone Oreslang fixed-width source -> combinational SystemVerilog.
 * Not integrated with full Oreslang frontends or shared HIR/MIR. Unsupported syntax fails closed.
 */
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
export function lex(source) {
  if(typeof source!=='string'||Buffer.byteLength(source,'utf8')>MAX_SOURCE||source.includes('\0')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(source)) fail('HDL_SOURCE_LIMIT',{offset:0},'source must be UTF-8 text at most 128 KiB');
  const tokens=[];
  const re=/\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_][A-Za-z0-9_]*|[()+\-,;:{}~&|^.!?<> =]|./gy;
  for(const m of source.matchAll(re)) {
    const value=m[0];
    if(/^\s+$/.test(value)||value.startsWith('//')||value.startsWith('/*')) continue;
    // Recognize Theater syntax early: a later '<' in a typed ActorMail
    // must not hide the more precise runtime-unsupported diagnostic.
    // Comments have already been removed by this lexer.
    if((value==='actor'||value==='supervisor')&&tokens.at(-1)?.value==='define')
      fail('HDL_ACTOR_UNSUPPORTED',{offset:tokens.at(-1).offset},
        'Atto Theater actor/supervisor definitions need a runtime; no RTL lowering');
    if(value==='<'&&['ActorMail','ActorGroup','Topic','Subscription'].includes(tokens.at(-1)?.value))
      fail('HDL_ACTOR_UNSUPPORTED',{offset:tokens.at(-1).offset},
        'Atto Theater typed actor/group/topic source needs a runtime; no RTL lowering');
    // Quoted text is one opaque token; no source literals or new punctuation
    // are ever admitted to the combinational RTL AST by the strict parser.
    const quoted=/^"(?:\\.|[^"\\])*"$|^'(?:\\.|[^'\\])*'$/.test(value);
    if(!quoted && !/^(?:[A-Za-z_][A-Za-z0-9_]*|[()+\-,;:{}~&|^.!?<>=])$/.test(value))
      fail('HDL_TOKEN',{offset:m.index},'unsupported token '+JSON.stringify(value));
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
    // The synthesizable RTL profile has no logical TaskId, Future,
    // TaskScope, cancellation or safe inline suspension lowering. Refuse
    // canonical Atto task prefixes explicitly instead of treating them as
    // host-side expressions or RTL identifiers.
    // Theater/Director/Ensemble are runtime actor services, not combinational
    // hardware operations. Reject an explicit actor/supervisor declaration or
    // actor lifecycle operation before accepting any RTL AST. Do not reserve
    // unrelated identifiers such as `topic_count` or `supervisor_id`.
    if(t.value==='.' && ts[k+1]?.value==='try_publish')
      fail('HDL_ACTOR_UNSUPPORTED',t,
        'Atto Ensemble Topic.try_publish requires typed, authorized actor runtime lowering');
    if ((t.value==='define' && (ts[k+1]?.value==='actor' || ts[k+1]?.value==='supervisor')) ||
        t.value==='spawn' ||
        (t.value==='receive' && ts[k+1]?.value==='(') ||
        (t.value==='ActorGroup' && ts[k+1]?.value==='(') ||
        (t.value==='Topic' && ts[k+1]?.value==='(') ||
        (t.value==='Subscription' && ts[k+1]?.value==='('))
      fail('HDL_ACTOR_UNSUPPORTED',t,
        'Atto Theater actor, supervisor and typed group/topic lifecycle require a target runtime; no RTL lowering');
    if(t.value==='sync'||t.value==='await')
      fail('HDL_TASK_UNSUPPORTED',t,
        'sync/await task requires Atto caller-identity and TaskScope semantics; no RTL lowering');
    if((t.value==='task'||t.value==='nb')&&opensBlock)
      fail('HDL_EXECUTION_DOMAIN',t,'execution task requires scheduler-aware Future lowering; not lowered to RTL');
  }
}
export function parseHardwareSource(source) {
  const ts=lex(source); let i=0;
  rejectExecutionDomains(ts);
  const peek=()=>ts[i],take=()=>ts[i++];
  const expect=want=>{const t=take();if(t.value!==want)fail('HDL_SYNTAX',t,'expected '+want+', got '+t.value);return t;};
  const ident=()=>{const t=take();if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.value))fail('HDL_IDENT',t,'expected identifier');if(!rtlIdent(t.value))fail('HDL_RESERVED',t,'identifier reserved by RTL backend');return t.value;};
  const width=()=>{const t=take(),m=/^u([1-9][0-9]*)$/.exec(t.value);if(!m||Number(m[1])>64)fail('HDL_WIDTH',t,'only unsigned u1..u64 are supported');return Number(m[1]);};
  if(peek().value==='pub')take();
  expect('fnc'); const name=ident();expect('(');
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
  expect(')');expect(':');const returnWidth=width();expect('{');expect('return');
  const symbols=new Map(params.map(p=>[p.name,p.width]));
  function primary(depth){
    if(depth>MAX_DEPTH)fail('HDL_DEPTH',peek(),'expression nesting limit');
    if(peek().value==='('){take();const e=expression(depth+1);expect(')');return e;}
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
      a={kind:'binary',op:op.value,left:a,right:b,width:a.width};
    }
    return a;
  }
  const additive=(depth)=>binaryLayer(primary,['+','-'],depth);
  const bitAnd=(depth)=>binaryLayer(additive,['&'],depth);
  const bitXor=(depth)=>binaryLayer(bitAnd,['^'],depth);
  const expression=(depth=0)=>binaryLayer(bitXor,['|'],depth);
  const expr=expression();expect(';');expect('}');expect('<eof>');
  if(!params.length)fail('HDL_PARAMS',{offset:0},'at least one input required');
  if(expr.width!==returnWidth)fail('HDL_RETURN_WIDTH',{offset:0},'return width does not equal expression width');
  return admitProgram({name,params,returnWidth,expression:expr});
}
function renderExpr(e){
  if(e.kind==='input')return 'in_'+e.name;
  return '('+renderExpr(e.left)+' '+e.op+' '+renderExpr(e.right)+')';
}
export function emitSystemVerilog(p){
  requireAdmittedProgram(p);
  const ports=p.params.map(x=>'    input logic ['+(x.width-1)+':0] in_'+x.name);
  ports.push('    output logic ['+(p.returnWidth-1)+':0] out_result');
  return '// Generated from EXPERIMENTAL Oreslang hardware subset\n// Unsigned arithmetic wraps at output width\nmodule ores_'+p.name+'(\n'+ports.join(',\n')+'\n);\n    assign out_result = '+renderExpr(p.expression)+';\nendmodule\n';
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
