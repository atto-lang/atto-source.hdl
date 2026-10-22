Rust-first, Linux-only, dependency-free static HLS optimization intent preflight.

`cargo test --offline --manifest-path tools/hls-intent-preflight/Cargo.toml`

`cargo run --offline --manifest-path tools/hls-intent-preflight/Cargo.toml -- examples/bounded_add.intent.json`

Checks bounded manifest numbers (including full signed/unsigned 128-bit width), duplicate JSON keys, exact schema, kernel identifier policy, declared bank-port collisions, final-component symlinks, bounded regular-file reads, and conservative II=1 dependency denial. This is **not** source compilation, HLS scheduling, proof of equivalence, RTL emission, or synthesis. The existing Python checker stays in CI as a comparison oracle until exact-head Rust execution and differential tests are verified.
