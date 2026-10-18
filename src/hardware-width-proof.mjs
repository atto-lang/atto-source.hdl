import {isProxy} from 'node:util/types';
// The hardware proof receives host-owned descriptors, not live guest objects.
// Snapshot exact own data properties before any semantic read. In particular,
// no accessor or Proxy trap may run while constructing a width certificate.
function snapshotExactRecord(value, fields, shapeError, dataError) {
  if(value===null || typeof value!=='object' || Array.isArray(value) ||
     isProxy(value) || (Object.getPrototypeOf(value)!==Object.prototype &&
                         Object.getPrototypeOf(value)!==null))deny(shapeError);
  const d=Object.getOwnPropertyDescriptors(value);
  if(fields.includes('signed') && !Object.hasOwn(d,'signed'))
    deny('explicit signedness required');
  if(Reflect.ownKeys(d).length!==fields.length ||
     fields.some(key=>!Object.hasOwn(d,key)||!Object.hasOwn(d[key],'value')))
    deny(dataError);
  return Object.fromEntries(fields.map(key=>[key,d[key].value]));
}
// Hardware-only finite-range width planning. No RTL is generated here.
// Proven mathematical no-overflow is required: general Oreslang int and
// fixed-width wrapping semantics must never be silently reinterpreted.
const deny = reason => {throw new RangeError('hardware width proof rejected: ' + reason);};
const requireValid = (ok, reason) => {if(!ok)deny(reason);};
const bounds = (bits, signed) => signed ?
  {min:-(1n<<BigInt(bits-1)),max:(1n<<BigInt(bits-1))-1n} :
  {min:0n,max:(1n<<BigInt(bits))-1n};
const checkWidth = bits => requireValid(Number.isSafeInteger(bits) && bits>=1 && bits<=128,
  'reference bits must be a safe integer in 1..128');
const checkRange = (r, label) => {
  const s=snapshotExactRecord(r,['min','max'],
    label + ' must be an exact finite bigint range',
    label + ' must use stable own bigint data properties');
  requireValid(typeof s.min==='bigint' && typeof s.max==='bigint' &&
    s.min<=s.max, label + ' must use stable own bigint data properties');
  return Object.freeze(s);
};
const fits = (r, bits, signed) => {
  const b=bounds(bits,signed);return r.min>=b.min && r.max<=b.max;
};
function narrowBits(r, signed, upperBits){
  for(let bits=1;bits<=upperBits;bits++)if(fits(r,bits,signed))return bits;
  deny('range is not representable without overflow');
}
function config(c){
  requireValid(c && typeof c==='object' && !Array.isArray(c), 'config required');
  requireValid(c.target==='fpga' || c.target==='asic', 'explicit hardware target required');
  requireValid(typeof c.signed==='boolean', 'explicit signedness required');
  checkWidth(c.referenceBits);
}
// Values of an n-bit counter are modeled as 0..maxInclusive including the
// terminal value. This is NOT a general counter code generator.
export function proveBoundedCounter(input){
  const {target,referenceBits,maxInclusive}=snapshotExactRecord(input,
    ['target','referenceBits','maxInclusive'],
    'counter configuration must be a plain non-proxy record',
    'counter configuration must have exact own data properties');
  const cfg={target,referenceBits,signed:false};config(cfg);
  requireValid(typeof maxInclusive==='bigint' && maxInclusive>=0n,
    'static nonnegative bigint counter bound required');
  const r={min:0n,max:maxInclusive};
  requireValid(fits(r,referenceBits,false),'counter bound exceeds declared reference width');
  return Object.freeze({target,referenceBits,resultBits:narrowBits(r,false,referenceBits),
    signed:false,range:Object.freeze({min:'0',max:maxInclusive.toString()}),
    proof:'exact static bounded unsigned range; no overflow'});
}
export function proveNarrowArithmetic(input){
  const {target,operation,left,right,signed,referenceBits}=snapshotExactRecord(input,
    ['target','operation','left','right','signed','referenceBits'],
    'arithmetic configuration must be a plain non-proxy record',
    'arithmetic configuration must have exact own data properties');
  const cfg={target,referenceBits,signed};config(cfg);
  requireValid(['add','sub','mul'].includes(operation), 'unknown hardware operation');
  left=checkRange(left,'left');right=checkRange(right,'right');
  requireValid(fits(left,referenceBits,signed) && fits(right,referenceBits,signed),
    'operand exceeds declared reference type');
  let result;
  if(operation==='add')result={min:left.min+right.min,max:left.max+right.max};
  if(operation==='sub')result={min:left.min-right.max,max:left.max-right.min};
  if(operation==='mul'){
    const p=[left.min*right.min,left.min*right.max,left.max*right.min,left.max*right.max];
    result={min:p.reduce((a,b)=>a<b?a:b),max:p.reduce((a,b)=>a>b?a:b)};
  }
  requireValid(fits(result,referenceBits,signed),
    'operation may overflow reference type (wrapped semantics not admitted)');
  return Object.freeze({target,operation,signed,referenceBits,
    resultBits:narrowBits(result,signed,referenceBits),
    range:Object.freeze({min:result.min.toString(),max:result.max.toString()}),
    proof:'all operand pairs fit reference type and exact result interval'});
}
