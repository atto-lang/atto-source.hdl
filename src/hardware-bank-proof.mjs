// Static hardware memory banking admission model. No RTL or physical mapping.
// The proof is conservative: unknown addresses, alias conflicts, and port
// oversubscription are rejected rather than assuming a multiported RAM.
const reject = why => {throw new RangeError('hardware bank proof rejected: '+why);};
const requireProof = (p,why) => {if(!p)reject(why);};
const integer = (n,min,max) => Number.isSafeInteger(n) && n>=min && n<=max;
function snapshotAccess(o) {
  // Reject getter/setter/proxy-style dynamic values: each access must have
  // stable own data fields before it can contribute to a hardware proof.
  requireProof(o!==null && typeof o==='object' && !Array.isArray(o) &&
    (Object.getPrototypeOf(o)===Object.prototype || Object.getPrototypeOf(o)===null) &&
    Object.keys(o).sort().join(',')==='address,kind',
    'only static exact address/kind supported');
  const d=Object.getOwnPropertyDescriptors(o);
  requireProof(Object.hasOwn(d.address,'value') && Object.hasOwn(d.kind,'value'),
    'accessor-backed memory access not admitted');
  return Object.freeze({address:d.address.value,kind:d.kind.value});
}
export function proveStaticBanking({target,depth,bankCount,readPorts,writePorts,totalPorts,cycles}={}) {
  requireProof(target==='fpga'||target==='asic','explicit FPGA/ASIC target required');
  requireProof(integer(depth,1,65536) && integer(bankCount,1,256) &&
    bankCount<=depth, 'static depth and bank count required');
  requireProof(integer(readPorts,0,8) && integer(writePorts,0,8) &&
    integer(totalPorts,1,8) && readPorts+writePorts>=1,
    'explicit physical port budgets required');
  requireProof(Array.isArray(cycles) && cycles.length<=1024,
    'bounded static clock-cycle plan required');
  let count=0;
  const schedule=[];
  for(let cycle=0;cycle<cycles.length;cycle++) {
    const accesses=cycles[cycle];
    requireProof(Array.isArray(accesses) && accesses.length<=1024,
      'bounded access list required');
    count+=accesses.length;
    requireProof(count<=16384,'total accesses exceed proof budget');
    const usage=new Map(), addresses=new Map(), row=[];
    for(const item of accesses) {
      const a=snapshotAccess(item);
      requireProof(typeof a.address==='bigint' && a.address>=0n &&
        a.address<BigInt(depth),'out-of-bounds or non-static address');
      requireProof(a.kind==='read'||a.kind==='write','unknown access kind');
      const bank=Number(a.address%BigInt(bankCount));
      const used=usage.get(bank)||{read:0,write:0};
      used[a.kind]++;
      requireProof(used.read<=readPorts && used.write<=writePorts &&
        used.read+used.write<=totalPorts,
        'memory bank port conflict in cycle '+cycle+' bank '+bank);
      usage.set(bank,used);
      // Physical single address writes/reads in same cycle have target-dependent
      // collision semantics, so reject even if nominal RAM ports exist.
      const key=a.address.toString();
      const previous=addresses.get(key);
      requireProof(!previous || (previous==='read' && a.kind==='read'),
        'same-address read/write or write/write hazard');
      addresses.set(key,a.kind);
      row.push(Object.freeze({bank,address:key,kind:a.kind}));
    }
    schedule.push(Object.freeze(row));
  }
  return Object.freeze({target,depth,bankCount,readPorts,writePorts,totalPorts,
    cycles:cycles.length,accessCount:count,
    schedule:Object.freeze(schedule),
    proof:'static modulo mapping with exact addresses and per-cycle port/hazard checks; no RTL'});
}
