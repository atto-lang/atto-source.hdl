//! Linux-only static JSON HLS-intent preflight: NOT synthesis or a compiler proof.
use std::{collections::BTreeMap, env, fs::OpenOptions, io::Read, path::Path};
#[cfg(target_os="linux")]
use std::os::unix::fs::OpenOptionsExt;

const MAX_BYTES: u64 = 65_536;
// Linux arm64 uses a different O_NOFOLLOW value from Linux x86_64.
#[cfg(all(target_os="linux", target_arch="aarch64"))]
const NOFOLLOW_NONBLOCK: i32 = 0o100000 | 0o4000;
#[cfg(all(target_os="linux", not(target_arch="aarch64")))]
const NOFOLLOW_NONBLOCK: i32 = 0o400000 | 0o4000;
const KEYS: [&str; 13] = ["schema_version","kernel","trip_count","unroll_factor",
    "word_width","signed","value_min","value_max","target_ii",
    "loop_carried_dependency","bank_count","read_ports_per_bank","concurrent_read_indices"];

#[derive(Debug, Clone)]
enum Json { Obj(BTreeMap<String,Json>), Arr(Vec<Json>), Text(String),
    Num(String), Bool(bool), Null }

struct Parser<'a> { src: &'a str, at: usize }
impl<'a> Parser<'a> {
    fn byte(&self)->Option<u8> { self.src.as_bytes().get(self.at).copied() }
    fn ws(&mut self) { while matches!(self.byte(),Some(b' '|b'\t'|b'\r'|b'\n')) {self.at+=1;} }
    fn take(&mut self,b:u8)->Result<(),String> {
        if self.byte()!=Some(b) {return Err(format!("bad JSON token at {}",self.at))}
        self.at+=1; Ok(())
    }
    fn literal(&mut self,word:&str)->Result<(),String> {
        if !self.src[self.at..].starts_with(word) {return Err("invalid JSON literal".into())}
        self.at+=word.len(); Ok(())
    }
    fn hex4(&mut self)->Result<u16,String> {
        let mut acc=0u16;
        for _ in 0..4 {
            let n=self.byte().and_then(|b|(b as char).to_digit(16))
                .ok_or("invalid Unicode escape")?;
            self.at+=1; acc=(acc<<4)|(n as u16);
        }
        Ok(acc)
    }
    fn string(&mut self)->Result<String,String> {
        self.take(b'"')?; let mut out=String::new();
        loop {
            let b=self.byte().ok_or("unterminated JSON string")?;
            if b==b'"' {self.at+=1;return Ok(out)}
            if b<32 {return Err("unescaped control byte in JSON string".into())}
            if b!=b'\\' {
                let c=self.src[self.at..].chars().next().ok_or("invalid string cursor")?;
                out.push(c);self.at+=c.len_utf8();continue;
            }
            self.at+=1; let escape=self.byte().ok_or("unterminated JSON escape")?;self.at+=1;
            match escape {
                b'"'=>out.push('"'),b'\\'=>out.push('\\'),b'/'=>out.push('/'),
                b'b'=>out.push('\u{8}'),b'f'=>out.push('\u{c}'),b'n'=>out.push('\n'),
                b'r'=>out.push('\r'),b't'=>out.push('\t'),
                b'u'=>{
                    let hi=self.hex4()?;
                    let code=if (0xD800..=0xDBFF).contains(&hi) {
                        self.take(b'\\')?;self.take(b'u')?;
                        let lo=self.hex4()?;
                        if !(0xDC00..=0xDFFF).contains(&lo) {
                            return Err("unpaired Unicode surrogate".into())
                        }
                        0x10000+(((hi as u32)-0xD800)<<10)+(lo as u32-0xDC00)
                    } else if (0xDC00..=0xDFFF).contains(&hi) {
                        return Err("unpaired low surrogate".into())
                    } else {hi as u32};
                    out.push(char::from_u32(code).ok_or("invalid Unicode scalar")?);
                }
                _=>return Err("invalid JSON escape".into())
            }
        }
    }
    fn number(&mut self)->Result<String,String> {
        let start=self.at;
        if self.byte()==Some(b'-'){self.at+=1}
        match self.byte() {
            Some(b'0')=>{self.at+=1;
                if self.byte().is_some_and(|c|c.is_ascii_digit()){
                    return Err("JSON leading zero".into())
                }
            }
            Some(b'1'..=b'9')=>{
                while self.byte().is_some_and(|c|c.is_ascii_digit()){self.at+=1}
            }
            _=>return Err("invalid JSON number".into())
        }
        if self.byte()==Some(b'.'){
            self.at+=1;
            if !self.byte().is_some_and(|c|c.is_ascii_digit()){return Err("missing fraction".into())}
            while self.byte().is_some_and(|c|c.is_ascii_digit()){self.at+=1}
        }
        if matches!(self.byte(),Some(b'e'|b'E')){
            self.at+=1;if matches!(self.byte(),Some(b'+'|b'-')){self.at+=1}
            if !self.byte().is_some_and(|c|c.is_ascii_digit()){return Err("missing exponent".into())}
            while self.byte().is_some_and(|c|c.is_ascii_digit()){self.at+=1}
        }
        Ok(self.src[start..self.at].into())
    }
    fn val(&mut self,depth:usize)->Result<Json,String> {
        if depth>16{return Err("JSON nesting exceeds limit".into())}
        self.ws();
        match self.byte().ok_or("missing JSON value")?{
            b'{'=>{
                self.at+=1;self.ws();let mut map=BTreeMap::new();
                if self.byte()==Some(b'}'){self.at+=1;return Ok(Json::Obj(map))}
                loop {
                    self.ws();let key=self.string()?;self.ws();self.take(b':')?;
                    let value=self.val(depth+1)?;
                    if map.insert(key.clone(),value).is_some(){
                        return Err(format!("duplicate JSON field: {key}"))
                    }
                    self.ws();match self.byte(){
                        Some(b'}')=>{self.at+=1;break}
                        Some(b',')=>{self.at+=1}
                        _=>return Err("malformed JSON object".into())
                    }
                }
                Ok(Json::Obj(map))
            }
            b'['=>{
                self.at+=1;self.ws();let mut xs=Vec::new();
                if self.byte()==Some(b']'){self.at+=1;return Ok(Json::Arr(xs))}
                loop {
                    if xs.len()>=1024{return Err("JSON list over budget".into())}
                    xs.push(self.val(depth+1)?);self.ws();
                    match self.byte(){
                        Some(b']')=>{self.at+=1;break}
                        Some(b',')=>{self.at+=1}
                        _=>return Err("malformed JSON list".into())
                    }
                }
                Ok(Json::Arr(xs))
            }
            b'"'=>Ok(Json::Text(self.string()?)),
            b't'=>{self.literal("true")?;Ok(Json::Bool(true))}
            b'f'=>{self.literal("false")?;Ok(Json::Bool(false))}
            b'n'=>{self.literal("null")?;Ok(Json::Null)}
            b'-'|b'0'..=b'9'=>Ok(Json::Num(self.number()?)),
            _=>Err("unsupported JSON token".into())
        }
    }
    fn parse(&mut self)->Result<Json,String> {
        let value=self.val(0)?;self.ws();
        if self.at!=self.src.len(){return Err("trailing JSON tokens".into())}
        Ok(value)
    }
}

fn as_map(value:&Json)->Result<&BTreeMap<String,Json>,String>{
    match value{Json::Obj(map)=>Ok(map),_=>Err("manifest must be an object".into())}
}
fn get<'a>(m:&'a BTreeMap<String,Json>,name:&str)->Result<&'a Json,String>{
    m.get(name).ok_or_else(||format!("missing {name}"))
}
// Python's JSON decoder treats the grammatically valid integer -0 as zero.
fn parse_unsigned(raw:&str)->Result<u128,String>{
    if raw=="-0" {return Ok(0)}
    raw.parse().map_err(|_|"invalid unsigned JSON integer".into())
}
fn unsigned(value:&Json,name:&str,lo:u128,hi:u128)->Result<u128,String>{
    let Json::Num(raw)=value else{return Err(format!("{name} must be an integer"))};
    let v=parse_unsigned(raw).map_err(|_|format!("{name} not an unsigned integer"))?;
    if v<lo||v>hi{return Err(format!("{name} outside [{lo},{hi}]"))}
    Ok(v)
}
fn boolean(m:&BTreeMap<String,Json>,name:&str)->Result<bool,String>{
    match get(m,name)?{Json::Bool(v)=>Ok(*v),_=>Err(format!("{name} must be boolean"))}
}
fn range_value(value:&Json,name:&str,width:u32,signed:bool)->Result<i128,String>{
    let Json::Num(raw)=value else{return Err(format!("{name} must be integer"))};
    if signed{
        let v:i128=raw.parse().map_err(|_|format!("{name} out of i128 range"))?;
        let min=if width==128{i128::MIN}else{-(1i128<<(width-1))};
        let max=if width==128{i128::MAX}else{(1i128<<(width-1))-1};
        if v<min||v>max{return Err(format!("{name} exceeds width"))}
        Ok(v)
    }else{
        let v=parse_unsigned(raw).map_err(|_|format!("{name} out of u128 range"))?;
        let max=if width==128{u128::MAX}else{(1u128<<width)-1};
        if v>max{return Err(format!("{name} exceeds width"))}
        Ok(i128::try_from(v).unwrap_or(i128::MAX))
    }
}
fn validate(document:&Json)->Result<String,String>{
    let m=as_map(document)?;
    if m.len()!=KEYS.len()||KEYS.iter().any(|key|!m.contains_key(*key)){
        return Err("unknown or missing intent manifest key".into())
    }
    unsigned(get(m,"schema_version")?,"schema_version",1,1)?;
    let Json::Text(name)=get(m,"kernel")? else{return Err("kernel is not a string".into())};
    if name.is_empty()||name.len()>128||
        !name.bytes().next().is_some_and(|c|c.is_ascii_alphabetic()||c==b'_')||
        !name.bytes().skip(1).all(|c|c.is_ascii_alphanumeric()||c==b'_'){
        return Err("invalid SystemVerilog kernel identifier".into())
    }
    if ["module","endmodule","input","output","inout","wire","reg","logic",
        "assign","always","initial","begin","end"].contains(&name.as_str()){
        return Err("reserved SystemVerilog identifier".into())
    }
    let trip=unsigned(get(m,"trip_count")?,"trip_count",1,65_536)?;
    let lanes=unsigned(get(m,"unroll_factor")?,"unroll_factor",1,256)?;
    if lanes>trip{return Err("unroll exceeds static trip count".into())}
    let width=unsigned(get(m,"word_width")?,"word_width",1,128)? as u32;
    let signed=boolean(m,"signed")?;
    let lo=range_value(get(m,"value_min")?,"value_min",width,signed)?;
    let hi=range_value(get(m,"value_max")?,"value_max",width,signed)?;
    if signed&&lo>hi{return Err("inverted signed range".into())}
    if !signed{
        let (Json::Num(a),Json::Num(b))=(get(m,"value_min")?,get(m,"value_max")?)
            else{return Err("invalid unsigned ranges".into())};
        if parse_unsigned(a)?>parse_unsigned(b)?{
            return Err("inverted unsigned range".into())
        }
    }
    let ii=unsigned(get(m,"target_ii")?,"target_ii",1,65_536)?;
    if ii==1&&boolean(m,"loop_carried_dependency")?{
        return Err("dependent loop cannot claim II=1 without scheduling proof".into())
    }
    let banks=unsigned(get(m,"bank_count")?,"bank_count",1,256)? as usize;
    let ports=unsigned(get(m,"read_ports_per_bank")?,"read_ports_per_bank",1,2)? as usize;
    let Json::Arr(indices)=get(m,"concurrent_read_indices")? else{
        return Err("concurrent indices must be a bounded array".into())
    };
    let mut reads=vec![0usize;banks];
    for index in indices{
        let idx=unsigned(index,"read index",0,trip-1)? as usize;
        let bank=idx%banks;reads[bank]+=1;
        if reads[bank]>ports{return Err(format!("bank {bank} exceeds declared read ports"))}
    }
    let counts=reads.iter().map(usize::to_string).collect::<Vec<_>>().join(", ");
    Ok(format!(r#"{{"declared_unroll_factor": {lanes}, "declared_width": {width}, "kernel": "{name}", "proved_equivalence": false, "proved_scheduling": false, "read_counts_per_bank": [{counts}], "status": "STATIC_PREFLIGHT_ONLY", "synthesized": false, "target_ii": {ii}}}"#))
}
fn validate_bytes(bytes:&[u8])->Result<String,String>{
    let input=std::str::from_utf8(bytes).map_err(|_|"invalid UTF-8")?;
    let data=Parser{src:input,at:0}.parse()?;
    validate(&data)
}
#[cfg(target_os="linux")]
fn read_manifest(path:&Path)->Result<Vec<u8>,String>{
    let file=OpenOptions::new().read(true).custom_flags(NOFOLLOW_NONBLOCK)
        .open(path).map_err(|e|format!("open denied: {e}"))?;
    let metadata=file.metadata().map_err(|e|e.to_string())?;
    if !metadata.is_file(){return Err("manifest must be regular".into())}
    if metadata.len()>MAX_BYTES{return Err("manifest exceeds 64 KiB".into())}
    let mut bytes=Vec::new();
    file.take(MAX_BYTES+1).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
    if bytes.len() as u64>MAX_BYTES{return Err("manifest exceeds 64 KiB".into())}
    Ok(bytes)
}
#[cfg(not(target_os="linux"))]
fn read_manifest(_path:&Path)->Result<Vec<u8>,String>{
    Err("safe nofollow manifest input unsupported".into())
}
fn main(){
    let mut args=env::args_os().skip(1);
    let Some(input)=args.next() else{
        eprintln!("usage: oreslang-hls-intent-preflight manifest.json");
        std::process::exit(64)
    };
    if args.next().is_some(){
        eprintln!("usage: oreslang-hls-intent-preflight manifest.json");
        std::process::exit(64)
    }
    match read_manifest(Path::new(&input)).and_then(|bytes|validate_bytes(&bytes)){
        Ok(report)=>println!("{report}"),
        Err(e)=>{eprintln!("REJECTED: {e}");std::process::exit(65)}
    }
}
#[cfg(test)]
mod tests{
    use super::*;
    const GOOD:&str=include_str!("../../../examples/bounded_add.intent.json");
    fn change(key:&str,old:&str,replacement:&str)->String{
        let target=format!(r#""{key}": {old}"#);
        assert!(GOOD.contains(&target));
        GOOD.replacen(&target,&format!(r#""{key}": {replacement}"#),1)
    }
    #[test]
    fn admits_real_example_without_hardware_claims(){
        let report=validate_bytes(GOOD.as_bytes()).unwrap();
        assert!(validate_bytes(change("value_min","0","-0").as_bytes()).is_ok());
        assert!(report.contains("STATIC_PREFLIGHT_ONLY"));
        assert!(report.contains(r#""synthesized": false"#));
        assert!(report.contains("[1, 1, 1, 1]"));
    }
    #[test]
    fn rejects_duplicates_unknown_fields_and_bad_json(){
        assert!(validate_bytes(br#"{"a":1,"a":2}"#).unwrap_err().contains("duplicate"));
        assert!(validate_bytes(br#"{"a":1,"\u0061":2}"#).unwrap_err().contains("duplicate"));
        assert!(validate_bytes(br#"{"b":{"x":1,"x":2}}"#).unwrap_err().contains("duplicate"));
        for sample in ["NaN","Infinity","-Infinity","[","null","{}","{\"a\": 7.0}"] {
            assert!(validate_bytes(sample.as_bytes()).is_err());
        }
        assert!(validate_bytes(&[255]).is_err());
        assert!(validate_bytes(br#"{"x":"\uD800"}"#).is_err());
        assert!(validate_bytes(br#"{"x":"\z"}"#).is_err());
    }
    #[test]
    fn rejects_false_scheduling_bank_collisions_and_types(){
        let mut variants=vec![
            change("word_width","7","6"),change("word_width","7","true"),
            change("signed","false","1"),
            change("loop_carried_dependency","false","true"),
            change("kernel",r#""bounded_add""#,r#""module""#),
            change("kernel",r#""bounded_add""#,r#""invalid-name""#),
            change("bank_count","4","0"),
            change("concurrent_read_indices","[\n    0,\n    1,\n    2,\n    3\n  ]","[0,4]"),
            change("concurrent_read_indices","[\n    0,\n    1,\n    2,\n    3\n  ]","[64]"),
        ];
        variants.push(GOOD.replace("\"schema_version\": 1", "\"schema_version\": 1, \"unknown\": true"));
        for variant in variants{assert!(validate_bytes(variant.as_bytes()).is_err())}
    }
    #[test]
    fn preserves_full_unsigned_and_signed_128_bit_bounds(){
        let mut source=change("word_width","7","128");
        source=source.replace("\"value_max\": 100",&format!("\"value_max\": {}",u128::MAX));
        assert!(validate_bytes(source.as_bytes()).is_ok());
        source=source.replace(&u128::MAX.to_string(),"340282366920938463463374607431768211456");
        assert!(validate_bytes(source.as_bytes()).is_err());
        let mut signed=change("word_width","7","128");
        signed=signed.replace("\"signed\": false","\"signed\": true");
        signed=signed.replace("\"value_min\": 0",&format!("\"value_min\": {}",i128::MIN));
        signed=signed.replace("\"value_max\": 100",&format!("\"value_max\": {}",i128::MAX));
        assert!(validate_bytes(signed.as_bytes()).is_ok());
    }
    #[cfg(target_os="linux")]
    #[test]
    fn rejects_symlink_directory_and_oversized_input(){
        use std::os::unix::fs::symlink;
        use std::time::{SystemTime,UNIX_EPOCH};
        let nonce=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir=env::temp_dir().join(format!("hls-intent-{}-{nonce}",std::process::id()));
        std::fs::create_dir(&dir).unwrap();
        let target=dir.join("manifest.json");std::fs::write(&target,GOOD).unwrap();
        assert!(read_manifest(&target).is_ok());assert!(read_manifest(&dir).is_err());
        let alias=dir.join("symlink.json");symlink(&target,&alias).unwrap();
        assert!(read_manifest(&alias).is_err());
        std::fs::write(&target,vec![b'x';(MAX_BYTES+1) as usize]).unwrap();
        assert!(read_manifest(&target).is_err());std::fs::remove_dir_all(dir).unwrap();
    }
}
