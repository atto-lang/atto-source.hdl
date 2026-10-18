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
  requireValid(r && typeof r==='object' && !Array.isArray(r) &&
    Object.keys(r).sort().join(',')==='max,min' &&
    typeof r.min==='bigint' && typeof r.max==='bigint' && r.min<=r.max,
    label + ' must be an exact finite bigint range');
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
export function proveBoundedCounter({target,referenceBits,maxInclusive}){
  const cfg={target,referenceBits,signed:false};config(cfg);
  requireValid(typeof maxInclusive==='bigint' && maxInclusive>=0n,
    'static nonnegative bigint counter bound required');
  const r={min:0n,max:maxInclusive};
  requireValid(fits(r,referenceBits,false),'counter bound exceeds declared reference width');
  return Object.freeze({target,referenceBits,resultBits:narrowBits(r,false,referenceBits),
    signed:false,range:{min:'0',max:maxInclusive.toString()},
    proof:'exact static bounded unsigned range; no overflow'});
}
export function proveNarrowArithmetic({target,operation,left,right,signed,referenceBits}){
  const cfg={target,referenceBits,signed};config(cfg);
  requireValid(['add','sub','mul'].includes(operation), 'unknown hardware operation');
  checkRange(left,'left');checkRange(right,'right');
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
    range:{min:result.min.toString(),max:result.max.toString()},
    proof:'all operand pairs fit reference type and exact result interval'});
}
