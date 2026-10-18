import {isProxy} from 'node:util/types';
// Static hardware memory banking admission model. No RTL or physical mapping.
// The proof is conservative: unknown addresses, alias conflicts, and port
// oversubscription are rejected rather than assuming a multiported RAM.
const reject = why => {throw new RangeError('hardware bank proof rejected: '+why);};
const requireProof = (p,why) => {if(!p)reject(why);};
const integer = (n,min,max) => Number.isSafeInteger(n) && n>=min && n<=max;
function snapshotRecord(o, keys, label) {
  // Stable plain data records only. Proxies and hostile host objects are not
  // a supported proof input: use decoded plain records from a trusted parser.
  const shapeError=label==='memory access' ?
    'only static exact address/kind supported' : label+' must be a plain record';
  const dataError=label==='memory access' ?
    'accessor-backed memory access not admitted' : label+' must have exact own data properties';
  requireProof(!isProxy(o) && o!==null && typeof o==='object' && !Array.isArray(o) &&
    (Object.getPrototypeOf(o)===Object.prototype || Object.getPrototypeOf(o)===null),
    shapeError);
  const d=Object.getOwnPropertyDescriptors(o);
  requireProof(Reflect.ownKeys(d).length===keys.length &&
    keys.every(k=>Object.hasOwn(d,k) && Object.hasOwn(d[k],'value')),
    dataError);
  return Object.fromEntries(keys.map(k=>[k,d[k].value]));
}
function snapshotArray(a, max, label) {
  requireProof(!isProxy(a) && Array.isArray(a) && Object.getPrototypeOf(a)===Array.prototype &&
    a.length<=max, label+' must be a bounded ordinary array');
  const d=Object.getOwnPropertyDescriptors(a);
  requireProof(Reflect.ownKeys(d).length===a.length+1,
    label+' must be dense and have no extra properties');
  const values=[];
  for(let i=0;i<a.length;i++) {
    const item=d[String(i)];
    requireProof(item && Object.hasOwn(item,'value'),
      label+' must have only dense own data elements');
    values.push(item.value);
  }
  return values;
}
export function proveStaticBanking(options={}) {
  const {target,depth,bankCount,readPorts,writePorts,totalPorts,cycles:cycleInput}=
    snapshotRecord(options,['target','depth','bankCount','readPorts','writePorts',
      'totalPorts','cycles'],'banking configuration');
  requireProof(target==='fpga'||target==='asic','explicit FPGA/ASIC target required');
  requireProof(integer(depth,1,65536) && integer(bankCount,1,256) &&
    bankCount<=depth, 'static depth and bank count required');
  requireProof(integer(readPorts,0,8) && integer(writePorts,0,8) &&
    integer(totalPorts,1,8) && readPorts+writePorts>=1,
    'explicit physical port budgets required');
  const cycles=snapshotArray(cycleInput,1024,'clock-cycle plan');
  let count=0;
  const schedule=[];
  for(let cycle=0;cycle<cycles.length;cycle++) {
    const accesses=snapshotArray(cycles[cycle],1024,'clock-cycle accesses');
    count+=accesses.length;
    requireProof(count<=16384,'total accesses exceed proof budget');
    const usage=new Map(), addresses=new Map(), row=[];
    for(const item of accesses) {
      const a=snapshotRecord(item,['address','kind'],'memory access');
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
