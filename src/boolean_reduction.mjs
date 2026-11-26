// Opt-in pure combinational Bool profile; no effectful evaluation or Array ABI.
const fail=detail=>{throw Error('HDL_BOOL_UNSUPPORTED: '+detail);};
const limit=detail=>{throw Error('HDL_BOOL_LIMIT: '+detail);};
const gates=new Set(['And','Or','Xor']);
export function compileBooleanReduction(source){
 if(typeof source!=='string'||Buffer.byteLength(source)>16384)limit('source');
 if(/[^\x09\x0a\x0d\x20-\x7e]/.test(source))fail('ASCII source only');
 const ts=[],re=/[ \t\r\n]+|\/\/[^\r\n]*|[A-Za-z_][A-Za-z_0-9]*|->|&&|\|\||[!(){}\[\],;:]/gy;
 for(let i=0;i<source.length;){
  re.lastIndex=i;const m=re.exec(source);if(!m)fail('token at '+i);
  i=re.lastIndex;if(!/^[ \t\r\n]|^\/\//.test(m[0]))ts.push(m[0]);
  if(ts.length>1024)limit('tokens');
 }
 let at=0,nodes=0;const peek=()=>ts[at],eat=v=>peek()===v?(at++,true):false;
 const expect=v=>{if(!eat(v))fail('expected '+v);};
 const bump=d=>{if(d>32||++nodes>512)limit('expression');};
 const params=new Map();
 function atom(d){
  bump(d);
  if(eat('!'))return '(!'+atom(d+1)+')';
  if(eat('(')){const value=expr(d+1);expect(')');return value;}
  if(eat('true'))return "1'b1";if(eat('false'))return "1'b0";
  const name=peek();if(params.has(name)){at++;return params.get(name);}
  if(!gates.has(name))fail('expected Bool operand');
  at++;expect('(');const pack=eat('['),end=pack?']':')',args=[];
  if(peek()!==end){do{if(args.length>=32)limit('arity');args.push(expr(d+1));}while(eat(','));}
  expect(end);if(pack)expect(')');else if(args.length<2)fail('scalar arity');
  if(!args.length)return name==='And'?"1'b1":"1'b0";
  // Every admitted input is pure, total and one bit. Combinational gates
  // preserve truth values, not an observable software evaluation order.
  return '('+args.join(name==='And'?' & ':name==='Or'?' | ':' ^ ')+')';
 }
 function conjunction(d){let a=atom(d);while(eat('&&')){bump(d);a='('+a+' & '+atom(d)+')';}return a;}
 function expr(d){let a=conjunction(d);while(eat('||')){bump(d);a='('+a+' | '+conjunction(d)+')';}return a;}
 eat('pub');expect('fnc');expect('gate');expect('(');
 if(peek()!==')')do{
  if(params.size>=16)limit('parameters');expect('bool');const name=peek();
  // Bound the identifier grammar; generated ports never contain source names.
  if(!/^[a-z_][a-z_0-9]*$/.test(name??'')||['true','false','bool','fnc','pub','gate','return','if','then','fi','val','let','int','void','actor','spawn','await','sync','select','import','new','self','and','or','xor','not','rt','copy','take','borrow','share','drop','pin','move','trap','throw','raise','panic','defer','recover'].includes(name)||params.has(name))fail('invalid Bool parameter');
  at++;params.set(name,'in_'+params.size);
 }while(eat(','));
 expect(')');if(!eat(':'))expect('->');expect('bool');expect('{');expect('return');const value=expr(0);expect(';');expect('}');if(at!==ts.length)fail('trailing source');
 const ports=[...params.values()].map(p=>'    input logic '+p);ports.push('    output logic out_result');
 return Object.freeze({profile:'hdl-pure-bool-v0',parameterCount:params.size,systemVerilog:'module atto_bool_gate(\n'+ports.join(',\n')+'\n);\n    assign out_result = '+value+';\nendmodule\n'});
}
