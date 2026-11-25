// Output classification is not a substitute for running Yosys. This function
// refuses ambiguous, missing, truncated and tool-error logs. In the real gate,
// the external Yosys SAT command is authoritative and must exit successfully.
export function requireYosysSatResult(run,expectEquivalent,context='SAT check') {
  if(run.error || run.signal || run.status!==0)
    throw new Error(context+': Yosys did not complete cleanly ('+
      String(run.error?.message ?? run.signal ?? run.status)+')');
  const log=String(run.stdout??'')+'\n'+String(run.stderr??'');
  const proof=/SAT proof finished - no model found: SUCCESS!/g;
  const counterexample=/SAT proof finished - model found: FAIL!/g;
  const positive=[...log.matchAll(proof)].length;
  const negative=[...log.matchAll(counterexample)].length;
  if(expectEquivalent ? positive!==1 || negative!==0 : negative!==1 || positive!==0)
    throw new Error(context+': missing, duplicate or contradictory Yosys proof witness: '+
      log.slice(-5000));
  return true;
}
